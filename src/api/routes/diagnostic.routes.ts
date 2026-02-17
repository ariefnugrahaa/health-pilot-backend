import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { diagnosticDecisionService } from '../../services/diagnostic/diagnostic-decision.service.js';
import type { AuthenticatedRequest, ApiResponse, HealthIntakeData } from '../../types/index.js';

const router = Router();

// ============================================
// Routes
// ============================================

/**
 * POST /diagnostics/evaluate
 * Evaluate diagnostic needs based on health intake
 *
 * This implements the "Diagnostic Decision Engine" from requirements:
 * - Determines whether blood testing is required
 * - Identifies which biomarkers are relevant
 * - Recommends minimum viable diagnostic panel
 */
router.post(
  '/evaluate',
  authenticate,
  [body('intakeId').isUUID().withMessage('Intake ID is required')],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const userId = req.user?.userId;
    const { intakeId } = req.body;

    if (!userId) {
      throw new ValidationError('Authentication required');
    }

    // Fetch the intake
    const intake = await prisma.healthIntake.findFirst({
      where: { id: intakeId, userId },
    });

    if (!intake) {
      throw new NotFoundError('Health intake');
    }

    // Decrypt intake data
    const intakeData = JSON.parse(
      encryptionService.decrypt(intake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // Get user's age if available
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    });

    let userAge: number | undefined;
    if (user?.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(user.dateOfBirth);
      userAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        userAge--;
      }
    }

    // Evaluate diagnostic needs
    const decision = await diagnosticDecisionService.evaluateDiagnosticNeeds(intakeData, userAge);

    const response: ApiResponse<typeof decision> = {
      success: true,
      data: decision,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /diagnostics/panels
 * Get available blood test panels with their biomarkers
 */
router.get(
  '/panels',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const panels = {
      targeted: {
        name: 'Targeted Panel',
        description: 'Basic panel for focused health goals',
        biomarkers: ['TSH', 'VIT_D', 'TESTOSTERONE_TOTAL'],
        estimatedCost: 49,
        currency: 'GBP',
      },
      'goal-based': {
        name: 'Goal-Based Panel',
        description: 'Comprehensive panel based on your health goals',
        biomarkers: ['TSH', 'T4_FREE', 'T3_FREE', 'CORTISOL', 'TESTOSTERONE_TOTAL'],
        estimatedCost: 99,
        currency: 'GBP',
      },
      comprehensive: {
        name: 'Comprehensive Panel',
        description: 'Complete health overview with all key biomarkers',
        biomarkers: [
          'TSH',
          'T4_FREE',
          'TESTOSTERONE_TOTAL',
          'LIPID_PANEL',
          'CBC',
          'HBA1C',
          'VIT_D',
          'VIT_B12',
          'FERRITIN',
        ],
        estimatedCost: 199,
        currency: 'GBP',
      },
    };

    const response: ApiResponse<typeof panels> = {
      success: true,
      data: panels,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /diagnostics/biomarkers
 * Get all available biomarkers with reference ranges
 */
router.get(
  '/biomarkers',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const biomarkers = await prisma.biomarker.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const response: ApiResponse<typeof biomarkers> = {
      success: true,
      data: biomarkers,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /diagnostics/explain
 * Get AI explanation for recommended biomarkers
 */
router.post(
  '/explain',
  authenticate,
  [
    body('biomarkerCodes').isArray({ min: 1 }).withMessage('At least one biomarker is required'),
    body('context').optional().isObject(),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { biomarkerCodes, context } = req.body as {
      biomarkerCodes: string[];
      context?: Record<string, unknown>;
    };

    // Fetch biomarker details
    const biomarkers = await prisma.biomarker.findMany({
      where: { code: { in: biomarkerCodes } },
    });

    // Generate explanations (in production, this would use AI)
    const explanations = biomarkers.map((bm) => ({
      code: bm.code,
      name: bm.name,
      category: bm.category,
      description:
        bm.description || `${bm.name} is a key biomarker in the ${bm.category} category.`,
      whyRecommended: context
        ? `Based on your health profile, ${bm.name} can provide valuable insights.`
        : `${bm.name} is commonly tested to assess ${bm.category} function.`,
      normalRange: {
        male:
          bm.referenceMinMale && bm.referenceMaxMale
            ? `${bm.referenceMinMale} - ${bm.referenceMaxMale} ${bm.unit}`
            : 'Varies',
        female:
          bm.referenceMinFemale && bm.referenceMaxFemale
            ? `${bm.referenceMinFemale} - ${bm.referenceMaxFemale} ${bm.unit}`
            : 'Varies',
      },
    }));

    const response: ApiResponse<typeof explanations> = {
      success: true,
      data: explanations,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
