import { Router, Request, Response } from 'express';

import { prisma } from '../../utils/database.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middlewares/error.middleware.js';
import {
  authenticate,
  requireAdmin,
  requireProviderAdmin,
} from '../middlewares/auth.middleware.js';
import type { ApiResponse, AuthenticatedRequest, TreatmentCategory } from '../../types/index.js';
import type { ProviderStatus } from '@prisma/client';

const router = Router();

// ============================================
// Admin Routes (Provider List)
// ============================================

/**
 * GET /providers/admin/list
 * List all providers for admin dashboard (with treatment counts)
 */
router.get(
  '/admin/list',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, search } = req.query as { status?: string; search?: string };

    const providers = await prisma.provider.findMany({
      where: {
        ...(status && status !== 'All' && { status: status as ProviderStatus }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        supportedRegions: true,
        logoUrl: true,
        acceptsBloodTests: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { treatments: true },
        },
      },
      orderBy: { name: 'asc' },
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
 * GET /providers/admin/:id
 * Get single provider detail for admin edit page (with treatments)
 */
router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = (req as AuthenticatedRequest & { params: { id: string } }).params;

    const provider = await prisma.provider.findUnique({
      where: { id },
      include: {
        treatments: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            isActive: true,
            priceOneTime: true,
            priceSubscription: true,
            currency: true,
            createdAt: true,
          },
          orderBy: { name: 'asc' },
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

// ============================================
// Public Routes
// ============================================

/**
 * GET /providers
 * List active providers (public)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, region } = req.query as { category?: string; region?: string };

    const providers = await prisma.provider.findMany({
      where: {
        status: 'ACTIVE',
        ...(region && { supportedRegions: { has: region } }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        websiteUrl: true,
        supportedRegions: true,
        treatments: {
          where: {
            isActive: true,
            ...(category && { category: category as TreatmentCategory }),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            priceOneTime: true,
            priceSubscription: true,
            currency: true,
          },
        },
      },
      orderBy: { name: 'asc' },
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
 * GET /providers/:slug
 * Get provider by slug (public)
 */
router.get(
  '/:slug',
  asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;

    const provider = await prisma.provider.findFirst({
      where: {
        slug: slug as string,
        status: 'ACTIVE',
      },
      include: {
        treatments: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            category: true,
            priceOneTime: true,
            priceSubscription: true,
            subscriptionFrequency: true,
            currency: true,
            requiresBloodTest: true,
          },
          orderBy: { name: 'asc' },
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
 * GET /providers/:slug/treatments
 * Get provider treatments (public)
 */
router.get(
  '/:slug/treatments',
  asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const { category } = req.query as { category?: string };

    const provider = await prisma.provider.findFirst({
      where: { slug: slug as string, status: 'ACTIVE' },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    const treatments = await prisma.treatment.findMany({
      where: {
        providerId: provider.id,
        isActive: true,
        ...(category && { category: category as TreatmentCategory }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: true,
        priceOneTime: true,
        priceSubscription: true,
        subscriptionFrequency: true,
        currency: true,
        minAge: true,
        maxAge: true,
        allowedGenders: true,
        requiresBloodTest: true,
      },
      orderBy: { name: 'asc' },
    });

    const response: ApiResponse<typeof treatments> = {
      success: true,
      data: treatments,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Admin Routes
// ============================================

/**
 * POST /providers
 * Create a new provider (admin only)
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      name,
      slug,
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
    } = (req as AuthenticatedRequest & { body: Record<string, unknown> }).body;

    // Check if slug exists
    const existing = await prisma.provider.findUnique({
      where: { slug: slug as string },
    });

    if (existing) {
      throw new ValidationError('Provider with this slug already exists');
    }

    const provider = await prisma.provider.create({
      data: {
        name: name as string,
        slug: slug as string,
        description: (description as string) ?? null,
        logoUrl: (logoUrl as string) ?? null,
        websiteUrl: (websiteUrl as string) ?? null,
        registrationNumber: (registrationNumber as string) ?? null,
        supportedRegions: (supportedRegions as string[]) ?? [],
        apiEndpoint: (apiEndpoint as string) ?? null,
        webhookUrl: (webhookUrl as string) ?? null,
        acceptsBloodTests: (acceptsBloodTests as boolean) ?? true,
        commissionRate: (commissionRate as number) ?? null,
        subscriptionShare: (subscriptionShare as number) ?? null,
        status: 'PENDING_APPROVAL',
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
 * PATCH /providers/:id
 * Update provider (admin only)
 */
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = (req as AuthenticatedRequest & { params: { id: string } }).params;
    const updateData = (req as AuthenticatedRequest & { body: Record<string, unknown> }).body;

    const provider = await prisma.provider.update({
      where: { id },
      data: updateData as Record<string, unknown>,
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
 * POST /providers/:id/treatments
 * Add treatment to provider (provider admin)
 */
router.post(
  '/:id/treatments',
  authenticate,
  requireProviderAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: providerId } = (req as AuthenticatedRequest & { params: { id: string } }).params;
    const {
      name,
      slug,
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
    } = (req as AuthenticatedRequest & { body: Record<string, unknown> }).body;

    // Verify provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Check if treatment slug exists
    const existing = await prisma.treatment.findUnique({
      where: { slug: slug as string },
    });

    if (existing) {
      throw new ValidationError('Treatment with this slug already exists');
    }

    const treatment = await prisma.treatment.create({
      data: {
        providerId,
        name: name as string,
        slug: slug as string,
        description: (description as string) ?? null,
        category: category as TreatmentCategory,
        priceOneTime: (priceOneTime as number) ?? null,
        priceSubscription: (priceSubscription as number) ?? null,
        subscriptionFrequency: (subscriptionFrequency as string) ?? null,
        currency: (currency as string) ?? 'GBP',
        minAge: (minAge as number) ?? null,
        maxAge: (maxAge as number) ?? null,
        allowedGenders:
          (allowedGenders as ('MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY')[]) ?? [],
        requiresBloodTest: (requiresBloodTest as boolean) ?? false,
        isActive: true,
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

export default router;
