import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import { prisma } from '../../../utils/database.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
} from '../../middlewares/error.middleware.js';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware.js';
import type {
  AuthenticatedRequest,
  ApiResponse,
  TreatmentCategory,
  Gender,
} from '../../../types/index.js';

const router = Router();

// ============================================
// Validation
// ============================================

const createTreatmentValidation = [
  body('providerId').isUUID().withMessage('Provider ID must be a valid UUID'),
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('slug')
    .isString()
    .notEmpty()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must be lowercase alphanumeric with hyphens'),
  body('category')
    .isIn([
      'HORMONE_THERAPY',
      'WEIGHT_MANAGEMENT',
      'SEXUAL_HEALTH',
      'MENTAL_HEALTH',
      'LONGEVITY',
      'SKIN_HEALTH',
      'HAIR_HEALTH',
      'SLEEP_OPTIMIZATION',
      'COGNITIVE_ENHANCEMENT',
      'GENERAL_WELLNESS',
    ])
    .withMessage('Invalid category'),
  body('priceOneTime').optional().isFloat({ min: 0 }),
  body('priceSubscription').optional().isFloat({ min: 0 }),
  body('subscriptionFrequency').optional().isIn(['monthly', 'quarterly', 'yearly']),
  body('minAge').optional().isInt({ min: 0, max: 120 }),
  body('maxAge').optional().isInt({ min: 0, max: 120 }),
  body('allowedGenders').optional().isArray(),
  body('requiresBloodTest').optional().isBoolean(),
];

const addBiomarkerValidation = [
  body('biomarkerId').isUUID().withMessage('Biomarker ID must be a valid UUID'),
  body('isRequired').optional().isBoolean(),
  body('minValue').optional().isFloat(),
  body('maxValue').optional().isFloat(),
];

const addContraindicationValidation = [
  body('condition').isString().notEmpty().withMessage('Condition is required'),
  body('severity')
    .isIn(['absolute', 'relative'])
    .withMessage('Severity must be absolute or relative'),
  body('description').optional().isString(),
];

// ============================================
// Treatment CRUD Routes
// ============================================

/**
 * GET /admin/treatments
 * List all treatments with full details
 */
router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId, category, isActive } = req.query as {
      providerId?: string;
      category?: string;
      isActive?: string;
    };

    const where: Record<string, unknown> = {};
    if (providerId) {
      where['providerId'] = providerId;
    }
    if (category) {
      where['category'] = category;
    }
    if (isActive !== undefined) {
      where['isActive'] = isActive === 'true';
    }

    const treatments = await prisma.treatment.findMany({
      where,
      include: {
        provider: {
          select: { id: true, name: true, slug: true },
        },
        treatmentBiomarkers: {
          include: { biomarker: true },
        },
        contraindications: true,
        matchingRules: {
          where: { isActive: true },
          select: { id: true, name: true, field: true, operator: true },
        },
        _count: {
          select: { treatmentMatches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: ApiResponse<typeof treatments> = {
      success: true,
      data: treatments,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /admin/treatments/:treatmentId
 * Get treatment with all related data
 */
router.get(
  '/:treatmentId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
      include: {
        provider: true,
        treatmentBiomarkers: {
          include: { biomarker: true },
        },
        contraindications: true,
        matchingRules: {
          orderBy: { priority: 'desc' },
        },
        _count: {
          select: { treatmentMatches: true },
        },
      },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    const response: ApiResponse<typeof treatment> = {
      success: true,
      data: treatment,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/treatments
 * Create a new treatment
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  createTreatmentValidation,
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

    const {
      providerId,
      name,
      slug,
      description,
      category,
      priceOneTime,
      priceSubscription,
      subscriptionFrequency,
      currency = 'GBP',
      minAge,
      maxAge,
      allowedGenders,
      requiresBloodTest = false,
    } = req.body as {
      providerId: string;
      name: string;
      slug: string;
      description?: string;
      category: TreatmentCategory;
      priceOneTime?: number;
      priceSubscription?: number;
      subscriptionFrequency?: string;
      currency?: string;
      minAge?: number;
      maxAge?: number;
      allowedGenders?: Gender[];
      requiresBloodTest?: boolean;
    };

    // Check provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Check slug is unique
    const existingSlug = await prisma.treatment.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw new ValidationError('Treatment with this slug already exists');
    }

    const treatment = await prisma.treatment.create({
      data: {
        providerId,
        name,
        slug,
        description: description ?? null,
        category,
        priceOneTime: priceOneTime ?? null,
        priceSubscription: priceSubscription ?? null,
        subscriptionFrequency: subscriptionFrequency ?? null,
        currency,
        minAge: minAge ?? null,
        maxAge: maxAge ?? null,
        allowedGenders: allowedGenders ?? [],
        requiresBloodTest,
        isActive: true,
      },
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    const response: ApiResponse<typeof treatment> = {
      success: true,
      data: treatment,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /admin/treatments/:treatmentId
 * Update a treatment
 */
router.patch(
  '/:treatmentId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const existing = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!existing) {
      throw new NotFoundError('Treatment');
    }

    const {
      name,
      description,
      category,
      priceOneTime,
      priceSubscription,
      subscriptionFrequency,
      currency,
      minAge,
      maxAge,
      allowedGenders,
      requiresBloodTest,
      isActive,
    } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData['name'] = name;
    }
    if (description !== undefined) {
      updateData['description'] = description;
    }
    if (category !== undefined) {
      updateData['category'] = category;
    }
    if (priceOneTime !== undefined) {
      updateData['priceOneTime'] = priceOneTime;
    }
    if (priceSubscription !== undefined) {
      updateData['priceSubscription'] = priceSubscription;
    }
    if (subscriptionFrequency !== undefined) {
      updateData['subscriptionFrequency'] = subscriptionFrequency;
    }
    if (currency !== undefined) {
      updateData['currency'] = currency;
    }
    if (minAge !== undefined) {
      updateData['minAge'] = minAge;
    }
    if (maxAge !== undefined) {
      updateData['maxAge'] = maxAge;
    }
    if (allowedGenders !== undefined) {
      updateData['allowedGenders'] = allowedGenders;
    }
    if (requiresBloodTest !== undefined) {
      updateData['requiresBloodTest'] = requiresBloodTest;
    }
    if (isActive !== undefined) {
      updateData['isActive'] = isActive;
    }

    const treatment = await prisma.treatment.update({
      where: { id: treatmentId },
      data: updateData,
      include: {
        provider: { select: { id: true, name: true } },
      },
    });

    const response: ApiResponse<typeof treatment> = {
      success: true,
      data: treatment,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /admin/treatments/:treatmentId
 * Soft delete (deactivate) a treatment
 */
router.delete(
  '/:treatmentId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const existing = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!existing) {
      throw new NotFoundError('Treatment');
    }

    // Soft delete by deactivating
    await prisma.treatment.update({
      where: { id: treatmentId },
      data: { isActive: false },
    });

    res.status(204).send();
  })
);

// ============================================
// Treatment Biomarkers Routes
// ============================================

/**
 * GET /admin/treatments/:treatmentId/biomarkers
 * List biomarkers required for a treatment
 */
router.get(
  '/:treatmentId/biomarkers',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const biomarkers = await prisma.treatmentBiomarker.findMany({
      where: { treatmentId },
      include: { biomarker: true },
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
 * POST /admin/treatments/:treatmentId/biomarkers
 * Add a biomarker requirement to a treatment
 */
router.post(
  '/:treatmentId/biomarkers',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID(), ...addBiomarkerValidation],
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

    const { treatmentId } = req.params as { treatmentId: string };
    const {
      biomarkerId,
      isRequired = true,
      minValue,
      maxValue,
    } = req.body as {
      biomarkerId: string;
      isRequired?: boolean;
      minValue?: number;
      maxValue?: number;
    };

    // Verify treatment exists
    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    // Verify biomarker exists
    const biomarker = await prisma.biomarker.findUnique({
      where: { id: biomarkerId },
    });

    if (!biomarker) {
      throw new NotFoundError('Biomarker');
    }

    // Check if already exists
    const existing = await prisma.treatmentBiomarker.findUnique({
      where: {
        treatmentId_biomarkerId: { treatmentId, biomarkerId },
      },
    });

    if (existing) {
      throw new ValidationError('This biomarker is already associated with this treatment');
    }

    const treatmentBiomarker = await prisma.treatmentBiomarker.create({
      data: {
        treatmentId,
        biomarkerId,
        isRequired,
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
      },
      include: { biomarker: true },
    });

    const response: ApiResponse<typeof treatmentBiomarker> = {
      success: true,
      data: treatmentBiomarker,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * DELETE /admin/treatments/:treatmentId/biomarkers/:biomarkerId
 * Remove a biomarker requirement from a treatment
 */
router.delete(
  '/:treatmentId/biomarkers/:biomarkerId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID(), param('biomarkerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId, biomarkerId } = req.params as { treatmentId: string; biomarkerId: string };

    const existing = await prisma.treatmentBiomarker.findUnique({
      where: {
        treatmentId_biomarkerId: { treatmentId, biomarkerId },
      },
    });

    if (!existing) {
      throw new NotFoundError('Treatment biomarker association');
    }

    await prisma.treatmentBiomarker.delete({
      where: {
        treatmentId_biomarkerId: { treatmentId, biomarkerId },
      },
    });

    res.status(204).send();
  })
);

// ============================================
// Treatment Contraindications Routes
// ============================================

/**
 * GET /admin/treatments/:treatmentId/contraindications
 * List contraindications for a treatment
 */
router.get(
  '/:treatmentId/contraindications',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const contraindications = await prisma.treatmentContraindication.findMany({
      where: { treatmentId },
      orderBy: { severity: 'asc' }, // absolute first
    });

    const response: ApiResponse<typeof contraindications> = {
      success: true,
      data: contraindications,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/treatments/:treatmentId/contraindications
 * Add a contraindication to a treatment
 */
router.post(
  '/:treatmentId/contraindications',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID(), ...addContraindicationValidation],
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

    const { treatmentId } = req.params as { treatmentId: string };
    const { condition, severity, description } = req.body as {
      condition: string;
      severity: 'absolute' | 'relative';
      description?: string;
    };

    // Verify treatment exists
    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    const contraindication = await prisma.treatmentContraindication.create({
      data: {
        treatmentId,
        condition,
        severity,
        description: description ?? null,
      },
    });

    const response: ApiResponse<typeof contraindication> = {
      success: true,
      data: contraindication,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * DELETE /admin/treatments/:treatmentId/contraindications/:contraindicationId
 * Remove a contraindication from a treatment
 */
router.delete(
  '/:treatmentId/contraindications/:contraindicationId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID(), param('contraindicationId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { contraindicationId } = req.params as { contraindicationId: string };

    const existing = await prisma.treatmentContraindication.findUnique({
      where: { id: contraindicationId },
    });

    if (!existing) {
      throw new NotFoundError('Contraindication');
    }

    await prisma.treatmentContraindication.delete({
      where: { id: contraindicationId },
    });

    res.status(204).send();
  })
);

// ============================================
// Bulk Import/Export Routes
// ============================================

/**
 * POST /admin/treatments/:treatmentId/full-setup
 * Create a treatment with all related data in one request
 */
router.post(
  '/full-setup',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatment, biomarkers, contraindications, matchingRules } = req.body as {
      treatment: {
        providerId: string;
        name: string;
        slug: string;
        description?: string;
        category: TreatmentCategory;
        priceOneTime?: number;
        priceSubscription?: number;
        subscriptionFrequency?: string;
        currency?: string;
        minAge?: number;
        maxAge?: number;
        allowedGenders?: Gender[];
        requiresBloodTest?: boolean;
      };
      biomarkers?: Array<{
        biomarkerId: string;
        isRequired?: boolean;
        minValue?: number;
        maxValue?: number;
      }>;
      contraindications?: Array<{
        condition: string;
        severity: 'absolute' | 'relative';
        description?: string;
      }>;
      matchingRules?: Array<{
        name: string;
        description?: string;
        field: string;
        operator: string;
        value: unknown;
        weight?: number;
        isRequired?: boolean;
        priority?: number;
      }>;
    };

    // Use transaction for all-or-nothing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create treatment
      const createdTreatment = await tx.treatment.create({
        data: {
          providerId: treatment.providerId,
          name: treatment.name,
          slug: treatment.slug,
          description: treatment.description,
          category: treatment.category,
          priceOneTime: treatment.priceOneTime,
          priceSubscription: treatment.priceSubscription,
          subscriptionFrequency: treatment.subscriptionFrequency,
          currency: treatment.currency ?? 'GBP',
          minAge: treatment.minAge,
          maxAge: treatment.maxAge,
          allowedGenders: treatment.allowedGenders ?? [],
          requiresBloodTest: treatment.requiresBloodTest ?? false,
          isActive: true,
        },
      });

      // 2. Create biomarkers
      if (biomarkers && biomarkers.length > 0) {
        for (const bm of biomarkers) {
          await tx.treatmentBiomarker.create({
            data: {
              treatmentId: createdTreatment.id,
              biomarkerId: bm.biomarkerId,
              isRequired: bm.isRequired ?? true,
              minValue: bm.minValue,
              maxValue: bm.maxValue,
            },
          });
        }
      }

      // 3. Create contraindications
      if (contraindications && contraindications.length > 0) {
        for (const ci of contraindications) {
          await tx.treatmentContraindication.create({
            data: {
              treatmentId: createdTreatment.id,
              condition: ci.condition,
              severity: ci.severity,
              description: ci.description,
            },
          });
        }
      }

      // 4. Create matching rules
      if (matchingRules && matchingRules.length > 0) {
        for (const rule of matchingRules) {
          await tx.matchingRule.create({
            data: {
              treatmentId: createdTreatment.id,
              name: rule.name,
              description: rule.description,
              field: rule.field,
              operator: rule.operator,
              value: JSON.stringify(rule.value),
              weight: rule.weight ?? 1.0,
              isRequired: rule.isRequired ?? false,
              isActive: true,
              priority: rule.priority ?? 0,
            },
          });
        }
      }

      return createdTreatment;
    });

    // Fetch full treatment with relations
    const fullTreatment = await prisma.treatment.findUnique({
      where: { id: result.id },
      include: {
        provider: { select: { id: true, name: true } },
        treatmentBiomarkers: { include: { biomarker: true } },
        contraindications: true,
        matchingRules: true,
      },
    });

    const response: ApiResponse<typeof fullTreatment> = {
      success: true,
      data: fullTreatment,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

export default router;
