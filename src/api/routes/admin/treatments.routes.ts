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
  body('providerId').optional().isUUID().withMessage('Provider ID must be a valid UUID (deprecated, use providerIds)'),
  body('providerIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Provider IDs must be a non-empty array of UUIDs')
    .custom((value) => {
      if (value && !value.every((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        throw new Error('All provider IDs must be valid UUIDs');
      }
      return true;
    }),
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
        treatmentProviders: {
          include: {
            provider: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
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
        treatmentProviders: {
          include: {
            provider: {
              select: { id: true, name: true, slug: true, status: true, supportedRegions: true },
            },
          },
        },
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
      providerId, // Deprecated: for backward compatibility
      providerIds,
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
      providerId?: string;
      providerIds?: string[];
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

    // Determine which providers to link
    // Use providerIds array if provided, otherwise fall back to single providerId for backward compatibility
    const providersToLink = providerIds && providerIds.length > 0
      ? providerIds
      : providerId
        ? [providerId]
        : [];

    if (providersToLink.length === 0) {
      throw new ValidationError('At least one provider must be specified (use providerIds array or providerId)');
    }

    // Check all providers exist
    const providers = await prisma.provider.findMany({
      where: { id: { in: providersToLink } },
    });

    if (providers.length !== providersToLink.length) {
      const foundIds = providers.map(p => p.id);
      const missingIds = providersToLink.filter(id => !foundIds.includes(id));
      throw new NotFoundError(`Provider(s) with ID(s): ${missingIds.join(', ')}`);
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
        providerId: providersToLink[0]!, // Keep for backward compatibility - guaranteed to exist
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
        treatmentProviders: {
          create: providersToLink.map((providerId, index) => ({
            providerId,
            isPrimary: index === 0, // First provider is primary
          })),
        },
      },
      include: {
        provider: {
          select: { id: true, name: true },
        },
        treatmentProviders: {
          include: {
            provider: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
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
      providerIds, // New: array of provider IDs to link
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

    // Handle provider updates if providerIds is provided
    if (providerIds !== undefined) {
      if (!Array.isArray(providerIds) || providerIds.length === 0) {
        throw new ValidationError('providerIds must be a non-empty array');
      }

      // Verify all providers exist
      const providers = await prisma.provider.findMany({
        where: { id: { in: providerIds } },
      });

      if (providers.length !== providerIds.length) {
        const foundIds = providers.map(p => p.id);
        const missingIds = providerIds.filter(id => !foundIds.includes(id));
        throw new NotFoundError(`Provider(s) with ID(s): ${missingIds.join(', ')}`);
      }

      // Update the deprecated providerId field to first provider
      updateData['providerId'] = providerIds[0];

      // Delete existing treatment-provider links and create new ones
      await prisma.treatmentProvider.deleteMany({
        where: { treatmentId },
      });

      await prisma.treatmentProvider.createMany({
        data: providerIds.map((providerId, index) => ({
          treatmentId,
          providerId,
          isPrimary: index === 0,
        })),
      });
    }

    const treatment = await prisma.treatment.update({
      where: { id: treatmentId },
      data: updateData,
      include: {
        provider: { select: { id: true, name: true } },
        treatmentProviders: {
          include: {
            provider: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
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
// Treatment Providers Routes (Many-to-Many)
// ============================================

/**
 * GET /admin/treatments/:treatmentId/providers
 * List all providers linked to a treatment
 */
router.get(
  '/:treatmentId/providers',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };

    const treatmentProviders = await prisma.treatmentProvider.findMany({
      where: { treatmentId },
      include: {
        provider: {
          select: { id: true, name: true, slug: true, status: true, supportedRegions: true },
        },
      },
      orderBy: { isPrimary: 'desc' },
    });

    const response: ApiResponse<typeof treatmentProviders> = {
      success: true,
      data: treatmentProviders,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/treatments/:treatmentId/providers
 * Add a provider to a treatment
 */
router.post(
  '/:treatmentId/providers',
  authenticate,
  requireAdmin,
  [
    param('treatmentId').isUUID(),
    body('providerId').isUUID().withMessage('Provider ID must be a valid UUID'),
    body('isPrimary').optional().isBoolean(),
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

    const { treatmentId } = req.params as { treatmentId: string };
    const { providerId, isPrimary = false } = req.body as {
      providerId: string;
      isPrimary?: boolean;
    };

    // Verify treatment exists
    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    // Verify provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Check if already linked
    const existing = await prisma.treatmentProvider.findUnique({
      where: {
        treatmentId_providerId: { treatmentId, providerId },
      },
    });

    if (existing) {
      throw new ValidationError('This provider is already linked to this treatment');
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await prisma.treatmentProvider.updateMany({
        where: { treatmentId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const treatmentProvider = await prisma.treatmentProvider.create({
      data: {
        treatmentId,
        providerId,
        isPrimary,
      },
      include: {
        provider: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    const response: ApiResponse<typeof treatmentProvider> = {
      success: true,
      data: treatmentProvider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * DELETE /admin/treatments/:treatmentId/providers/:providerId
 * Remove a provider from a treatment
 */
router.delete(
  '/:treatmentId/providers/:providerId',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID(), param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId, providerId } = req.params as { treatmentId: string; providerId: string };

    const existing = await prisma.treatmentProvider.findUnique({
      where: {
        treatmentId_providerId: { treatmentId, providerId },
      },
    });

    if (!existing) {
      throw new NotFoundError('Treatment-provider association');
    }

    await prisma.treatmentProvider.delete({
      where: {
        treatmentId_providerId: { treatmentId, providerId },
      },
    });

    res.status(204).send();
  })
);

/**
 * PATCH /admin/treatments/:treatmentId/providers/:providerId
 * Update a treatment-provider link (e.g., set as primary)
 */
router.patch(
  '/:treatmentId/providers/:providerId',
  authenticate,
  requireAdmin,
  [
    param('treatmentId').isUUID(),
    param('providerId').isUUID(),
    body('isPrimary').isBoolean(),
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

    const { treatmentId, providerId } = req.params as { treatmentId: string; providerId: string };
    const { isPrimary } = req.body as { isPrimary: boolean };

    const existing = await prisma.treatmentProvider.findUnique({
      where: {
        treatmentId_providerId: { treatmentId, providerId },
      },
    });

    if (!existing) {
      throw new NotFoundError('Treatment-provider association');
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await prisma.treatmentProvider.updateMany({
        where: { treatmentId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const treatmentProvider = await prisma.treatmentProvider.update({
      where: {
        treatmentId_providerId: { treatmentId, providerId },
      },
      data: { isPrimary },
      include: {
        provider: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    const response: ApiResponse<typeof treatmentProvider> = {
      success: true,
      data: treatmentProvider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Bulk Import/Export Routes
// ============================================

/**
 * POST /admin/treatments/full-setup
 * Create a treatment with all related data in one request
 */
router.post(
  '/full-setup',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatment, biomarkers, contraindications, matchingRules } = req.body as {
      treatment: {
        providerId?: string; // Deprecated: use providerIds
        providerIds?: string[];
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

    // Determine which providers to link
    const providersToLink = treatment.providerIds && treatment.providerIds.length > 0
      ? treatment.providerIds
      : treatment.providerId
        ? [treatment.providerId]
        : [];

    if (providersToLink.length === 0) {
      throw new ValidationError('At least one provider must be specified (use providerIds array or providerId)');
    }

    // Use transaction for all-or-nothing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create treatment
      const createdTreatment = await tx.treatment.create({
        data: {
          providerId: providersToLink[0], // Keep for backward compatibility
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
          treatmentProviders: {
            create: providersToLink.map((providerId, index) => ({
              providerId,
              isPrimary: index === 0,
            })),
          },
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
        treatmentProviders: {
          include: {
            provider: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
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
