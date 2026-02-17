import { Request, Response, NextFunction, Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../../utils/database.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { auditPhiAccess } from '../middlewares/audit.middleware.js';
import { bloodTestService } from '../../services/bloodtest/bloodtest.service.js';
import {
  bloodTestInterpretationService,
  BIOMARKER_REFERENCES,
} from '../../services/bloodtest/bloodtest-interpretation.service.js';
import { sendBloodTestResultsNotification } from '../../services/notification/notification.service.js';
import type { AuthenticatedRequest, BloodTestResult, ApiResponse } from '../../types/index.js';

const router = Router();

// ============================================
// Routes
// ============================================

/**
 * GET /blood-tests
 * List all user's blood tests
 */
router.get(
  '/',
  authenticate,
  auditPhiAccess('blood_test'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new Error('User not found');
    }

    const {
      status,
      limit = '10',
      offset = '0',
    } = req.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const where: Record<string, unknown> = { userId };
    if (status) {
      where['status'] = status;
    }

    const [tests, total] = await Promise.all([
      prisma.bloodTest.findMany({
        where,
        include: {
          labPartner: {
            select: { id: true, name: true },
          },
          interpretation: {
            select: { id: true, createdAt: true },
          },
          _count: {
            select: { biomarkerResults: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.bloodTest.count({ where }),
    ]);

    const response: ApiResponse<typeof tests> = {
      success: true,
      data: tests,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: {
          page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /blood-tests
 * Order a new blood test
 */
router.post(
  '/',
  authenticate,
  [
    body('panelType')
      .isIn(['targeted', 'goal-based', 'comprehensive'])
      .withMessage('Invalid panel type'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { panelType } = (req as AuthenticatedRequest & { body: { panelType: string } }).body;

    if (!userId) {
      throw new Error('User not found');
    }

    const testId = await bloodTestService.orderTest(userId, panelType);

    res.status(201).json({
      success: true,
      data: { id: testId },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * GET /blood-tests/biomarkers
 * Get available biomarker reference data
 */
router.get(
  '/biomarkers',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      success: true,
      data: BIOMARKER_REFERENCES,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * GET /blood-tests/:testId
 */
router.get(
  '/:testId',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { testId } = req.params as { testId: string };

    if (!userId) {
      throw new Error('User not found');
    }

    const test = await bloodTestService.getTest(testId, userId);

    res.status(200).json({
      success: true,
      data: test,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * GET /blood-tests/:testId/interpretation
 * Get AI-generated interpretation for blood test
 */
router.get(
  '/:testId/interpretation',
  authenticate,
  auditPhiAccess('blood_test_interpretation'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { testId } = req.params as { testId: string };

    if (!userId) {
      throw new Error('User not found');
    }

    // Try to get existing interpretation
    let interpretation = await bloodTestInterpretationService.getInterpretation(testId, userId);

    // Generate if not exists
    if (!interpretation) {
      interpretation = await bloodTestInterpretationService.interpretBloodTest(testId, userId);
    }

    res.status(200).json({
      success: true,
      data: interpretation,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /blood-tests/:testId/interpretation
 * Generate or regenerate AI interpretation
 */
router.post(
  '/:testId/interpretation',
  authenticate,
  auditPhiAccess('blood_test_interpretation'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { testId } = req.params as { testId: string };
    const { regenerate } = req.body as { regenerate?: boolean };

    if (!userId) {
      throw new Error('User not found');
    }

    const interpretation = regenerate
      ? await bloodTestInterpretationService.regenerateInterpretation(testId, userId)
      : await bloodTestInterpretationService.interpretBloodTest(testId, userId);

    res.status(200).json({
      success: true,
      data: interpretation,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /blood-tests/:testId/results
 * Webhook for results (Simulation)
 * In production, this would be secured by API Key or Signature from Lab Partner
 */
router.post(
  '/:testId/results',
  authWebhook, // Simplified mock middleware or public for demo? Let's assume protected by simple check or public for dev.
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { testId } = req.params as { testId: string };
    const results = req.body as BloodTestResult[];

    await bloodTestService.processResults(testId, results);

    // Get test to find userId for notification
    const test = await prisma.bloodTest.findUnique({
      where: { id: testId },
      select: { userId: true },
    });

    if (test?.userId) {
      // Send notification about results
      await sendBloodTestResultsNotification(test.userId, testId);
    }

    res.status(200).json({ success: true });
  })
);

function authWebhook(_req: Request, _res: Response, next: NextFunction): void {
  // Check for API key in header 'X-Lab-Key'
  // For demo, we skip
  next();
}

export default router;
