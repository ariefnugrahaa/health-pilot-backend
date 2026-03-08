import { Router, type Response } from 'express';
import { prisma } from '../../../utils/database.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../../types/index.js';

const router = Router();

// ============================================
// Types
// ============================================

interface SupplementListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  isActive: boolean;
  affiliateLinks: Record<string, string> | null;
  targetSymptoms: string[];
  targetGoals: string[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    supplementMatches: number;
  };
}

interface CreateSupplementPayload {
  name: string;
  slug: string;
  description?: string;
  category: string;
  evidenceLevel?: string;
  primaryBenefits?: string[];
  recommendedDosage?: string;
  dosageUnit?: string;
  frequency?: string;
  targetSymptoms?: string[];
  targetGoals?: string[];
  targetBiomarkers?: string[];
  minAge?: number;
  maxAge?: number;
  allowedGenders?: string[];
  contraindications?: string[];
  interactions?: string[];
  sideEffects?: string[];
  safetyNotes?: string;
  affiliateLinks?: Record<string, string>;
  averagePrice?: number;
  currency?: string;
  isActive?: boolean;
}

// ============================================
// GET /api/admin/supplements
// List all supplements with filters
// ============================================
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const statusParam = req.query.status;
    const searchParam = req.query.search;

    // Build where clause
    const where: Record<string, unknown> = {};

    const status = Array.isArray(statusParam) ? statusParam[0] : statusParam;
    if (status && status !== 'All') {
      where.isActive = status === 'ACTIVE';
    }

    const search = Array.isArray(searchParam) ? searchParam[0] : searchParam;
    if (search) {
      where.OR = [
        { name: { ilike: `%${search}%` } },
        { description: { ilike: `%${search}%` } },
      ];
    }

    const supplements = await prisma.supplement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { supplementMatches: true },
        },
      },
    });

    // Count linked retailers from affiliateLinks
    const data = supplements.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      category: s.category,
      isActive: s.isActive,
      affiliateLinks: s.affiliateLinks,
      targetSymptoms: s.targetSymptoms,
      targetGoals: s.targetGoals,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      linkedRetailers: s.affiliateLinks
        ? Object.keys(s.affiliateLinks as Record<string, string>).length
        : 0,
      _count: s._count,
    }));

    res.json({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// GET /api/admin/supplements/:id
// Get supplement by ID
// ============================================
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const supplement = await prisma.supplement.findUnique({
      where: { id },
    });

    if (!supplement) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Supplement not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: supplement,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// POST /api/admin/supplements
// Create new supplement
// ============================================
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const payload: CreateSupplementPayload = req.body;

    // Check if slug already exists
    const existing = await prisma.supplement.findUnique({
      where: { slug: payload.slug },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: 'DUPLICATE_SLUG', message: 'A supplement with this slug already exists' },
      });
      return;
    }

    const supplement = await prisma.supplement.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description || null,
        category: payload.category as never,
        evidenceLevel: payload.evidenceLevel || null,
        primaryBenefits: payload.primaryBenefits || [],
        recommendedDosage: payload.recommendedDosage || null,
        dosageUnit: payload.dosageUnit || null,
        frequency: payload.frequency || null,
        targetSymptoms: payload.targetSymptoms || [],
        targetGoals: payload.targetGoals || [],
        targetBiomarkers: payload.targetBiomarkers || [],
        minAge: payload.minAge ?? null,
        maxAge: payload.maxAge ?? null,
        allowedGenders: (payload.allowedGenders || []) as never[],
        contraindications: payload.contraindications || [],
        interactions: payload.interactions || [],
        sideEffects: payload.sideEffects || [],
        safetyNotes: payload.safetyNotes || null,
        affiliateLinks: payload.affiliateLinks || null,
        averagePrice: payload.averagePrice ?? null,
        currency: payload.currency || 'GBP',
        isActive: payload.isActive ?? true,
      },
    });

    res.status(201).json({
      success: true,
      data: supplement,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// PATCH /api/admin/supplements/:id
// Update supplement
// ============================================
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const payload: Partial<CreateSupplementPayload> = req.body;

    // Check if supplement exists
    const existing = await prisma.supplement.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Supplement not found' },
      });
      return;
    }

    // If slug is being changed, check for duplicates
    if (payload.slug && payload.slug !== existing.slug) {
      const duplicate = await prisma.supplement.findUnique({
        where: { slug: payload.slug },
      });
      if (duplicate) {
        res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE_SLUG', message: 'A supplement with this slug already exists' },
        });
        return;
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.slug !== undefined) updateData.slug = payload.slug;
    if (payload.description !== undefined) updateData.description = payload.description;
    if (payload.category !== undefined) updateData.category = payload.category;
    if (payload.evidenceLevel !== undefined) updateData.evidenceLevel = payload.evidenceLevel;
    if (payload.primaryBenefits !== undefined) updateData.primaryBenefits = payload.primaryBenefits;
    if (payload.recommendedDosage !== undefined) updateData.recommendedDosage = payload.recommendedDosage;
    if (payload.dosageUnit !== undefined) updateData.dosageUnit = payload.dosageUnit;
    if (payload.frequency !== undefined) updateData.frequency = payload.frequency;
    if (payload.targetSymptoms !== undefined) updateData.targetSymptoms = payload.targetSymptoms;
    if (payload.targetGoals !== undefined) updateData.targetGoals = payload.targetGoals;
    if (payload.targetBiomarkers !== undefined) updateData.targetBiomarkers = payload.targetBiomarkers;
    if (payload.minAge !== undefined) updateData.minAge = payload.minAge;
    if (payload.maxAge !== undefined) updateData.maxAge = payload.maxAge;
    if (payload.allowedGenders !== undefined) updateData.allowedGenders = payload.allowedGenders;
    if (payload.contraindications !== undefined) updateData.contraindications = payload.contraindications;
    if (payload.interactions !== undefined) updateData.interactions = payload.interactions;
    if (payload.sideEffects !== undefined) updateData.sideEffects = payload.sideEffects;
    if (payload.safetyNotes !== undefined) updateData.safetyNotes = payload.safetyNotes;
    if (payload.affiliateLinks !== undefined) updateData.affiliateLinks = payload.affiliateLinks;
    if (payload.averagePrice !== undefined) updateData.averagePrice = payload.averagePrice;
    if (payload.currency !== undefined) updateData.currency = payload.currency;
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive;

    const supplement = await prisma.supplement.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: supplement,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// DELETE /api/admin/supplements/:id
// Delete supplement
// ============================================
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Check if supplement exists
    const existing = await prisma.supplement.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Supplement not found' },
      });
      return;
    }

    await prisma.supplement.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: { message: 'Supplement deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

export default router;
