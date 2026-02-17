import { Router, type Response } from 'express';
import {
  supplementService,
  type SupplementCategory,
  type Supplement,
} from '../../services/supplement/supplement.service.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router = Router();

// ============================================
// Public Endpoints (No Auth Required)
// ============================================

/**
 * GET /api/supplements
 * List all active supplements
 */
router.get(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    // Get all active supplements from all categories
    const categories: SupplementCategory[] = [
      'VITAMIN',
      'MINERAL',
      'HERB',
      'AMINO_ACID',
      'PROBIOTIC',
      'OMEGA',
      'ENZYME',
      'ADAPTOGEN',
      'LIFESTYLE_CHANGE',
      'OTHER',
    ];

    const allSupplements: Supplement[] = [];
    for (const category of categories) {
      const supplements = await supplementService.getSupplementsByCategory(category);
      allSupplements.push(...supplements);
    }

    res.json({
      success: true,
      data: allSupplements,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/supplements/category/:category
 * Get supplements by category
 */
router.get(
  '/category/:category',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const category = req.params.category as SupplementCategory;

    const supplements = await supplementService.getSupplementsByCategory(category);

    res.json({
      success: true,
      data: supplements,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/supplements/:slug
 * Get supplement by slug
 */
router.get(
  '/:slug',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const slug = req.params.slug as string;

    const supplement = await supplementService.getSupplementBySlug(slug);

    if (!supplement) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SUPPLEMENT_NOT_FOUND',
          message: `Supplement with slug '${slug}' not found`,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: supplement,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

// ============================================
// Authenticated Endpoints
// ============================================

/**
 * POST /api/supplements/match
 * Find matching supplements for user
 * Requires authentication
 */
router.post(
  '/match',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      symptoms = [],
      goals = [],
      biomarkerCodes = [],
      medications = [],
      conditions = [],
      age = null,
      gender = null,
      maxResults = 10,
    } = req.body;

    const matches = await supplementService.findMatchingSupplements({
      userAge: age,
      userGender: gender,
      symptoms,
      goals,
      biomarkerCodes,
      medications,
      conditions,
      maxResults,
    });

    res.json({
      success: true,
      data: matches,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/supplements/match/:matchId/click
 * Record affiliate click on a supplement match
 * Optional auth (for tracking)
 */
router.post(
  '/match/:matchId/click',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const matchId = req.params.matchId as string;

    await supplementService.recordAffiliateClick(matchId);

    res.json({
      success: true,
      data: {
        message: 'Click recorded',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/supplements/match/:matchId/purchase
 * Record purchase of a supplement
 * Optional auth (for tracking)
 */
router.post(
  '/match/:matchId/purchase',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const matchId = req.params.matchId as string;

    await supplementService.recordPurchase(matchId);

    res.json({
      success: true,
      data: {
        message: 'Purchase recorded',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

export default router;
