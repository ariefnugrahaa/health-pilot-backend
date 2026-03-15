import { Router, Response } from 'express';

import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';

import { asyncHandler, NotFoundError, ValidationError } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { auditPhiAccess } from '../middlewares/audit.middleware.js';
import { recommendationService } from '../../services/recommendation/recommendation.service.js';
import { explanationService } from '../../services/explanation/explanation.service.js';
import type { ApiResponse, AuthenticatedRequest, TreatmentExplanation } from '../../types/index.js';

const router = Router();

// ============================================
// Routes
// ============================================

/**
 * POST /recommendations/generate
 * Generate recommendations from health intake
 */
router.post(
  '/generate',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { intakeId } = (req as AuthenticatedRequest & { body: { intakeId: string } }).body;

    if (!intakeId) {
      throw new ValidationError('intakeId is required');
    }

    if (!userId) {
      throw new ValidationError('Authentication required');
    }

    // Generate recommendation via service
    // This handles: fetch intake, matching, AI analysis, saving results
    const recommendationId = await recommendationService.generateRecommendation(userId, intakeId);

    // Fetch the created recommendation to return response
    const rec = await prisma.recommendation.findUniqueOrThrow({
      where: { id: recommendationId },
    });

    const response: ApiResponse<{
      id: string;
      status: string;
      primaryRecommendations: string[];
      createdAt: Date;
    }> = {
      success: true,
      data: {
        id: rec.id,
        status: rec.status,
        primaryRecommendations: rec.primaryRecommendations,
        createdAt: rec.createdAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /recommendations/:recommendationId
 * Get recommendation details
 */
router.get(
  '/:recommendationId',
  authenticate,
  auditPhiAccess('recommendation'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { recommendationId } = (
      req as AuthenticatedRequest & { params: { recommendationId: string } }
    ).params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const recommendation = await prisma.recommendation.findFirst({
      where: {
        id: recommendationId,
        userId,
      },
      include: {
        treatmentMatches: {
          include: {
            treatment: {
              include: {
                provider: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    logoUrl: true,
                  },
                },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!recommendation) {
      throw new NotFoundError('Recommendation');
    }

    // Decrypt health summary
    const healthSummary = encryptionService.decrypt(recommendation.healthSummaryEncrypted);

    // Mark as viewed
    if (recommendation.status === 'GENERATED') {
      await prisma.recommendation.update({
        where: { id: recommendationId },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
        },
      });
    }

    // Format treatment matches
    const treatmentPathways = recommendation.treatmentMatches.map((match) => {
      const provider = match.treatment.provider ?? {
        id: '',
        name: 'Unknown Provider',
        slug: 'unknown-provider',
        logoUrl: null,
      };

      return {
        treatmentId: match.treatmentId,
        treatmentName: match.treatment.name,
        category: match.treatment.category,
        relevanceScore: Number(match.relevanceScore),
        matchReasons: match.matchReasons,
        contraindications: match.contraindications,
        isEligible: match.isEligible,
        provider: {
          id: provider.id,
          name: provider.name,
          slug: provider.slug,
          logoUrl: provider.logoUrl,
        },
        pricing: {
          oneTime: match.treatment.priceOneTime ? Number(match.treatment.priceOneTime) : undefined,
          subscription: match.treatment.priceSubscription
            ? Number(match.treatment.priceSubscription)
            : undefined,
          subscriptionFrequency: match.treatment.subscriptionFrequency ?? undefined,
          currency: match.treatment.currency,
        },
      };
    });

    const response: ApiResponse<{
      id: string;
      status: string;
      healthSummary: string;
      primaryRecommendations: string[];
      treatmentPathways: typeof treatmentPathways;
      createdAt: Date;
      viewedAt: Date | null;
    }> = {
      success: true,
      data: {
        id: recommendation.id,
        status: recommendation.status,
        healthSummary,
        primaryRecommendations: recommendation.primaryRecommendations,
        treatmentPathways,
        createdAt: recommendation.createdAt,
        viewedAt: recommendation.viewedAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /recommendations
 * List user's recommendations
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const recommendations = await prisma.recommendation.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        primaryRecommendations: true,
        createdAt: true,
        viewedAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: ApiResponse<typeof recommendations> = {
      success: true,
      data: recommendations,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /recommendations/:recommendationId/treatments/:treatmentId/explain
 * Get comprehensive "Why this?" explanation for a treatment
 *
 * This endpoint provides detailed, AI-powered explanation including:
 * - Why this treatment was recommended
 * - How the treatment works (educational)
 * - Evidence support
 * - Personalized factors
 * - Biomarker insights (if blood tests available)
 * - Limitations and disclaimers
 * - Related alternatives
 */
router.get(
  '/:recommendationId/treatments/:treatmentId/explain',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { recommendationId, treatmentId } = (
      req as AuthenticatedRequest & { params: { recommendationId: string; treatmentId: string } }
    ).params;
    const userId = req.user?.userId;

    if (!userId) {
      throw new NotFoundError('User');
    }

    // Get comprehensive explanation
    const explanation = await explanationService.getExplanation(
      userId,
      recommendationId,
      treatmentId
    );

    const response: ApiResponse<TreatmentExplanation> = {
      success: true,
      data: explanation,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /recommendations/:recommendationId/treatments/:treatmentId/explain/quick
 * Get quick summary explanation for a treatment
 *
 * This is a lighter-weight endpoint that returns pre-computed match reasons
 * without making additional AI calls. Use this for initial display or
 * when full explanation is not needed.
 */
router.get(
  '/:recommendationId/treatments/:treatmentId/explain/quick',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { recommendationId, treatmentId } = (
      req as AuthenticatedRequest & { params: { recommendationId: string; treatmentId: string } }
    ).params;
    const userId = req.user?.userId;

    if (!userId) {
      throw new NotFoundError('User');
    }

    // Get quick explanation (no AI call)
    const quickExplanation = await explanationService.getQuickExplanation(
      userId,
      recommendationId,
      treatmentId
    );

    const response: ApiResponse<{
      summary: string;
      keyReasons: string[];
    }> = {
      success: true,
      data: quickExplanation,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /recommendations/:recommendationId/explain (DEPRECATED)
 * Legacy endpoint - use GET /recommendations/:id/treatments/:treatmentId/explain instead
 *
 * Kept for backward compatibility
 */
router.post(
  '/:recommendationId/explain',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { recommendationId } = (
      req as AuthenticatedRequest & { params: { recommendationId: string } }
    ).params;
    const { treatmentId } = (req as AuthenticatedRequest & { body: { treatmentId: string } }).body;
    const userId = req.user?.userId;

    if (!userId) {
      throw new NotFoundError('User');
    }

    if (!treatmentId) {
      throw new ValidationError('treatmentId is required');
    }

    // Use quick explanation for backward compatibility
    const quickExplanation = await explanationService.getQuickExplanation(
      userId,
      recommendationId,
      treatmentId
    );

    const response: ApiResponse<{
      treatmentId: string;
      summary: string;
      keyReasons: string[];
    }> = {
      success: true,
      data: {
        treatmentId,
        ...quickExplanation,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
