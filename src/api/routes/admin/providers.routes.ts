import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import { prisma } from '../../../utils/database.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
} from '../../middlewares/error.middleware.js';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware.js';
import type { AuthenticatedRequest, ApiResponse, ProviderStatus } from '../../../types/index.js';
import { PROVIDER_CATEGORY_VALUES } from '../../../constants/provider-categories.js';

const router = Router();

// ============================================
// Validation
// ============================================

const createProviderValidation = [
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('slug')
    .isString()
    .notEmpty()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must be lowercase alphanumeric with hyphens'),
  body('category').isIn(PROVIDER_CATEGORY_VALUES).withMessage('Valid category is required'),
  body('description').optional().isString(),
  body('logoUrl').optional().isURL(),
  body('websiteUrl').optional().isURL(),
  body('registrationNumber').optional().isString(),
  body('supportedRegions').optional().isArray(),
  body('apiEndpoint').optional().isURL(),
  body('webhookUrl').optional().isURL(),
  body('acceptsBloodTests').optional().isBoolean(),
  body('commissionRate').optional().isFloat({ min: 0, max: 1 }),
  body('subscriptionShare').optional().isFloat({ min: 0, max: 1 }),
];

const updateProviderValidation = [
  body('name').optional().isString().notEmpty(),
  body('category').optional().isIn(PROVIDER_CATEGORY_VALUES).withMessage('Valid category is required'),
  body('description').optional().isString(),
  body('logoUrl').optional().isURL(),
  body('websiteUrl').optional().isURL(),
  body('registrationNumber').optional().isString(),
  body('supportedRegions').optional().isArray(),
  body('apiEndpoint').optional().isURL(),
  body('webhookUrl').optional().isURL(),
  body('acceptsBloodTests').optional().isBoolean(),
  body('commissionRate').optional().isFloat({ min: 0, max: 1 }),
  body('subscriptionShare').optional().isFloat({ min: 0, max: 1 }),
  body('status').optional().isIn(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'INACTIVE']),
];

const addProviderAdminValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').isString().notEmpty().withMessage('Name is required'),
];

// ============================================
// Provider Management Routes
// ============================================

/**
 * GET /admin/providers
 * List all providers with stats
 */
router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, region } = req.query as { status?: string; region?: string };

    const where: Record<string, unknown> = {};
    if (status) {
      where['status'] = status;
    }
    if (region) {
      where['supportedRegions'] = { has: region };
    }

    const providers = await prisma.provider.findMany({
      where,
      include: {
        _count: {
          select: {
            treatments: true,
            treatmentProviders: true,
            providerHandoffs: true,
            providerAdmins: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: ApiResponse<typeof providers> = {
      success: true,
      data: providers,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /admin/providers/:providerId
 * Get provider details
 */
router.get(
  '/:providerId',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId } = req.params as { providerId: string };

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      include: {
        treatments: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true, category: true, isActive: true },
        },
        treatmentProviders: {
          include: {
            treatment: {
              select: { id: true, name: true, slug: true, category: true, isActive: true },
            },
          },
        },
        providerAdmins: {
          select: { id: true, email: true, name: true, isActive: true },
        },
        _count: {
          select: { providerHandoffs: true },
        },
      },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    const response: ApiResponse<typeof provider> = {
      success: true,
      data: provider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/providers
 * Create a new provider (onboarding)
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  createProviderValidation,
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
      name,
      slug,
      category,
      description,
      logoUrl,
      websiteUrl,
      registrationNumber,
      supportedRegions = ['GB'],
      apiEndpoint,
      webhookUrl,
      acceptsBloodTests = true,
      commissionRate,
      subscriptionShare,
    } = req.body as {
      name: string;
      slug: string;
      category: string;
      description?: string;
      logoUrl?: string;
      websiteUrl?: string;
      registrationNumber?: string;
      supportedRegions?: string[];
      apiEndpoint?: string;
      webhookUrl?: string;
      acceptsBloodTests?: boolean;
      commissionRate?: number;
      subscriptionShare?: number;
    };

    // Check slug uniqueness
    const existingSlug = await prisma.provider.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw new ValidationError('Provider with this slug already exists');
    }

    const provider = await prisma.provider.create({
      data: {
        name,
        slug,
        category: category as never,
        description: description ?? null,
        logoUrl: logoUrl ?? null,
        websiteUrl: websiteUrl ?? null,
        status: 'PENDING_APPROVAL',
        registrationNumber: registrationNumber ?? null,
        supportedRegions,
        apiEndpoint: apiEndpoint ?? null,
        webhookUrl: webhookUrl ?? null,
        acceptsBloodTests,
        commissionRate: commissionRate ?? null,
        subscriptionShare: subscriptionShare ?? null,
      },
    });

    const response: ApiResponse<typeof provider> = {
      success: true,
      data: provider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /admin/providers/:providerId
 * Update provider profile
 */
router.patch(
  '/:providerId',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID(), ...updateProviderValidation],
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

    const { providerId } = req.params as { providerId: string };

    const existing = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!existing) {
      throw new NotFoundError('Provider');
    }

    const {
      name,
      category,
      description,
      logoUrl,
      websiteUrl,
      registrationNumber,
      supportedRegions,
      apiEndpoint,
      webhookUrl,
      acceptsBloodTests,
      commissionRate,
      subscriptionShare,
      status,
    } = req.body as {
      name?: string;
      category?: string;
      description?: string;
      logoUrl?: string;
      websiteUrl?: string;
      registrationNumber?: string;
      supportedRegions?: string[];
      apiEndpoint?: string;
      webhookUrl?: string;
      acceptsBloodTests?: boolean;
      commissionRate?: number;
      subscriptionShare?: number;
      status?: ProviderStatus;
    };

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData['name'] = name;
    }
    if (category !== undefined) {
      updateData['category'] = category;
    }
    if (description !== undefined) {
      updateData['description'] = description;
    }
    if (logoUrl !== undefined) {
      updateData['logoUrl'] = logoUrl;
    }
    if (websiteUrl !== undefined) {
      updateData['websiteUrl'] = websiteUrl;
    }
    if (registrationNumber !== undefined) {
      updateData['registrationNumber'] = registrationNumber;
    }
    if (supportedRegions !== undefined) {
      updateData['supportedRegions'] = supportedRegions;
    }
    if (apiEndpoint !== undefined) {
      updateData['apiEndpoint'] = apiEndpoint;
    }
    if (webhookUrl !== undefined) {
      updateData['webhookUrl'] = webhookUrl;
    }
    if (acceptsBloodTests !== undefined) {
      updateData['acceptsBloodTests'] = acceptsBloodTests;
    }
    if (commissionRate !== undefined) {
      updateData['commissionRate'] = commissionRate;
    }
    if (subscriptionShare !== undefined) {
      updateData['subscriptionShare'] = subscriptionShare;
    }
    if (status !== undefined) {
      updateData['status'] = status;
    }

    const provider = await prisma.provider.update({
      where: { id: providerId },
      data: updateData,
    });

    const response: ApiResponse<typeof provider> = {
      success: true,
      data: provider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/providers/:providerId/approve
 * Approve a pending provider
 */
router.post(
  '/:providerId/approve',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId } = req.params as { providerId: string };

    const existing = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!existing) {
      throw new NotFoundError('Provider');
    }

    if (existing.status !== 'PENDING_APPROVAL') {
      throw new ValidationError('Provider is not pending approval');
    }

    const provider = await prisma.provider.update({
      where: { id: providerId },
      data: { status: 'ACTIVE' },
    });

    const response: ApiResponse<typeof provider> = {
      success: true,
      data: provider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/providers/:providerId/suspend
 * Suspend an active provider
 */
router.post(
  '/:providerId/suspend',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId } = req.params as { providerId: string };

    const existing = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!existing) {
      throw new NotFoundError('Provider');
    }

    const provider = await prisma.provider.update({
      where: { id: providerId },
      data: { status: 'SUSPENDED' },
    });

    // Optionally deactivate all treatments
    await prisma.treatment.updateMany({
      where: { providerId },
      data: { isActive: false },
    });

    const response: ApiResponse<typeof provider> = {
      success: true,
      data: provider,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Provider Admin Management Routes
// ============================================

/**
 * GET /admin/providers/:providerId/admins
 * List provider admins
 */
router.get(
  '/:providerId/admins',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId } = req.params as { providerId: string };

    const admins = await prisma.providerAdmin.findMany({
      where: { providerId },
      orderBy: { createdAt: 'asc' },
    });

    const response: ApiResponse<typeof admins> = {
      success: true,
      data: admins,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/providers/:providerId/admins
 * Add a provider admin
 */
router.post(
  '/:providerId/admins',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID(), ...addProviderAdminValidation],
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

    const { providerId } = req.params as { providerId: string };
    const { email, name } = req.body as { email: string; name: string };

    // Verify provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Check email uniqueness
    const existingEmail = await prisma.providerAdmin.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new ValidationError('Admin with this email already exists');
    }

    const admin = await prisma.providerAdmin.create({
      data: {
        providerId,
        email,
        name,
        isActive: true,
      },
    });

    const response: ApiResponse<typeof admin> = {
      success: true,
      data: admin,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * DELETE /admin/providers/:providerId/admins/:adminId
 * Remove a provider admin
 */
router.delete(
  '/:providerId/admins/:adminId',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID(), param('adminId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adminId } = req.params as { adminId: string };

    const existing = await prisma.providerAdmin.findUnique({
      where: { id: adminId },
    });

    if (!existing) {
      throw new NotFoundError('Provider admin');
    }

    await prisma.providerAdmin.delete({
      where: { id: adminId },
    });

    res.status(204).send();
  })
);

// ============================================
// Provider Data Standardization Routes
// ============================================

/**
 * GET /admin/providers/:providerId/catalogue
 * Get provider's full treatment catalogue with standardized schema
 */
router.get(
  '/:providerId/catalogue',
  authenticate,
  requireAdmin,
  [param('providerId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId } = req.params as { providerId: string };

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      include: {
        treatments: {
          where: { isActive: true },
          include: {
            treatmentBiomarkers: {
              include: { biomarker: true },
            },
            contraindications: true,
            matchingRules: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Standardize the catalogue format
    const catalogue = {
      providerId: provider.id,
      providerName: provider.name,
      providerSlug: provider.slug,
      geographicCoverage: provider.supportedRegions,
      acceptsBloodTests: provider.acceptsBloodTests,
      treatments: provider.treatments.map((t) => ({
        treatmentId: t.id,
        name: t.name,
        slug: t.slug,
        category: t.category,
        pricing: {
          oneTime: t.priceOneTime ? Number(t.priceOneTime) : null,
          subscription: t.priceSubscription ? Number(t.priceSubscription) : null,
          subscriptionFrequency: t.subscriptionFrequency,
          currency: t.currency,
        },
        eligibility: {
          minAge: t.minAge,
          maxAge: t.maxAge,
          allowedGenders: t.allowedGenders,
          requiresBloodTest: t.requiresBloodTest,
        },
        requiredBiomarkers: t.treatmentBiomarkers.map((tb) => ({
          code: tb.biomarker.code,
          name: tb.biomarker.name,
          isRequired: tb.isRequired,
          minValue: tb.minValue ? Number(tb.minValue) : null,
          maxValue: tb.maxValue ? Number(tb.maxValue) : null,
        })),
        contraindications: t.contraindications.map((c) => ({
          condition: c.condition,
          severity: c.severity,
          description: c.description,
        })),
        matchingRulesCount: t.matchingRules.length,
      })),
    };

    const response: ApiResponse<typeof catalogue> = {
      success: true,
      data: catalogue,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
