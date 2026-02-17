import { Router, Response } from 'express';

import { asyncHandler, ValidationError } from '../middlewares/error.middleware.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import { providerRatingService } from '../../services/feedback/provider-rating.service.js';
import type { ApiResponse, AuthenticatedRequest } from '../../types/index.js';
import type {
    CreateProviderRatingDto,
    UpdateProviderRatingDto,
    ProviderRatingFilters,
    ReportRatingDto,
} from '../../types/feedback.types.js';

const router = Router();

// ============================================
// Public Routes
// ============================================

/**
 * GET /providers/:providerId/ratings
 * Get all ratings for a provider (public)
 */
router.get(
    '/:providerId/ratings',
    asyncHandler(async (req, res: Response) => {
        const { providerId } = req.params;
        const { page, limit, category, minRating } = req.query;

        const filters: ProviderRatingFilters = {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 10,
            category: category as ProviderRatingFilters['category'],
            minRating: minRating ? parseInt(minRating as string, 10) : undefined,
        };

        const result = await providerRatingService.getProviderRatings(providerId as string, filters);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /providers/:providerId/ratings/summary
 * Get rating summary for a provider (public)
 */
router.get(
    '/:providerId/ratings/summary',
    asyncHandler(async (req, res: Response) => {
        const { providerId } = req.params;

        const summary = await providerRatingService.getProviderSummary(providerId as string);

        const response: ApiResponse<typeof summary> = {
            success: true,
            data: summary,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /ratings/:ratingId
 * Get a specific rating by ID (public)
 */
router.get(
    '/ratings/:ratingId',
    asyncHandler(async (req, res: Response) => {
        const { ratingId } = req.params;

        const rating = await providerRatingService.getRatingById(ratingId as string);

        const response: ApiResponse<typeof rating> = {
            success: true,
            data: rating,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

// ============================================
// Protected Routes (Authentication Required)
// ============================================

/**
 * POST /providers/:providerId/ratings
 * Create a new rating for a provider
 */
router.post(
    '/:providerId/ratings',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { providerId } = req.params;
        const userId = req.user!.userId;
        const body = req.body as CreateProviderRatingDto;

        // Validate required fields
        if (!body.rating || body.rating < 1 || body.rating > 5) {
            throw new ValidationError('Rating must be between 1 and 5');
        }

        const dto: CreateProviderRatingDto = {
            providerId: providerId as string,
            handoffId: body.handoffId,
            category: body.category || 'OVERALL',
            rating: body.rating,
            reviewTitle: body.reviewTitle,
            reviewText: body.reviewText,
            wouldRecommend: body.wouldRecommend,
            isPublic: body.isPublic,
        };

        const rating = await providerRatingService.createRating(userId, dto);

        const response: ApiResponse<typeof rating> = {
            success: true,
            data: rating,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(201).json(response);
    })
);

/**
 * PUT /ratings/:ratingId
 * Update an existing rating
 */
router.put(
    '/ratings/:ratingId',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { ratingId } = req.params;
        const userId = req.user!.userId;
        const body = req.body as UpdateProviderRatingDto;

        // Validate rating if provided
        if (body.rating !== undefined && (body.rating < 1 || body.rating > 5)) {
            throw new ValidationError('Rating must be between 1 and 5');
        }

        const rating = await providerRatingService.updateRating(userId, ratingId as string, body);

        const response: ApiResponse<typeof rating> = {
            success: true,
            data: rating,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * DELETE /ratings/:ratingId
 * Delete a rating
 */
router.delete(
    '/ratings/:ratingId',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { ratingId } = req.params;
        const userId = req.user!.userId;

        await providerRatingService.deleteRating(userId, ratingId as string);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /user/ratings
 * Get all ratings by the current user
 */
router.get(
    '/user/ratings',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.userId;
        const { page, limit, category } = req.query;

        const filters: ProviderRatingFilters = {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 10,
            category: category as ProviderRatingFilters['category'],
            minRating: undefined,
        };

        const result = await providerRatingService.getUserRatings(userId, filters);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * POST /ratings/:ratingId/helpful
 * Mark a rating as helpful
 */
router.post(
    '/ratings/:ratingId/helpful',
    optionalAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { ratingId } = req.params;
        const userId = req.user?.userId;

        if (!userId) {
            throw new ValidationError('Authentication required to mark helpful');
        }

        await providerRatingService.markHelpful(userId, ratingId as string);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * POST /ratings/:ratingId/report
 * Report a rating for moderation
 */
router.post(
    '/ratings/:ratingId/report',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { ratingId } = req.params;
        const userId = req.user!.userId;
        const { reason } = req.body as ReportRatingDto;

        if (!reason || reason.trim().length < 10) {
            throw new ValidationError('Report reason must be at least 10 characters');
        }

        await providerRatingService.reportRating(userId, ratingId as string, reason);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

export default router;
