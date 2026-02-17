import { Router, Response } from 'express';

import { asyncHandler, ValidationError } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { treatmentFeedbackService } from '../../services/feedback/treatment-feedback.service.js';
import type { ApiResponse, AuthenticatedRequest } from '../../types/index.js';
import type {
    CreateTreatmentFeedbackDto,
    UpdateTreatmentFeedbackDto,
    TreatmentFeedbackFilters,
} from '../../types/feedback.types.js';

const router = Router();

// ============================================
// Public Routes
// ============================================

/**
 * GET /treatments/:treatmentId/feedback
 * Get all feedback for a treatment (public)
 */
router.get(
    '/:treatmentId/feedback',
    asyncHandler(async (req, res: Response) => {
        const { treatmentId } = req.params;
        const { page, limit, outcome } = req.query;

        const filters: TreatmentFeedbackFilters = {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 10,
            outcome: outcome as TreatmentFeedbackFilters['outcome'],
            treatmentId: undefined,
            providerId: undefined,
        };

        const result = await treatmentFeedbackService.getTreatmentFeedback(treatmentId as string, filters);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /treatments/:treatmentId/feedback/summary
 * Get feedback summary for a treatment (public)
 */
router.get(
    '/:treatmentId/feedback/summary',
    asyncHandler(async (req, res: Response) => {
        const { treatmentId } = req.params;

        const summary = await treatmentFeedbackService.getTreatmentSummary(treatmentId as string);

        const response: ApiResponse<typeof summary> = {
            success: true,
            data: summary,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /providers/:providerId/feedback
 * Get all feedback for a provider (public)
 */
router.get(
    '/providers/:providerId/feedback',
    asyncHandler(async (req, res: Response) => {
        const { providerId } = req.params;
        const { page, limit, outcome, treatmentId } = req.query;

        const filters: TreatmentFeedbackFilters = {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 10,
            outcome: outcome as TreatmentFeedbackFilters['outcome'],
            treatmentId: treatmentId as string | undefined,
            providerId: undefined,
        };

        const result = await treatmentFeedbackService.getProviderFeedback(providerId as string, filters);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /feedback/:feedbackId
 * Get a specific feedback by ID (public)
 */
router.get(
    '/feedback/:feedbackId',
    asyncHandler(async (req, res: Response) => {
        const { feedbackId } = req.params;

        const feedback = await treatmentFeedbackService.getFeedbackById(feedbackId as string);

        const response: ApiResponse<typeof feedback> = {
            success: true,
            data: feedback,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

// ============================================
// Protected Routes (Authentication Required)
// ============================================

/**
 * POST /treatments/:treatmentId/feedback
 * Create new feedback for a treatment
 */
router.post(
    '/:treatmentId/feedback',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { treatmentId } = req.params;
        const userId = req.user!.userId;
        const body = req.body as CreateTreatmentFeedbackDto;

        // Validate required fields
        if (!body.outcome) {
            throw new ValidationError('Outcome is required');
        }

        if (!body.providerId) {
            throw new ValidationError('Provider ID is required');
        }

        // Validate ratings if provided
        const ratings = [
            { name: 'effectivenessRating', value: body.effectivenessRating },
            { name: 'sideEffectsRating', value: body.sideEffectsRating },
            { name: 'easeOfUseRating', value: body.easeOfUseRating },
        ];

        for (const rating of ratings) {
            if (rating.value !== undefined && (rating.value < 1 || rating.value > 5)) {
                throw new ValidationError(`${rating.name} must be between 1 and 5`);
            }
        }

        const dto: CreateTreatmentFeedbackDto = {
            treatmentId: treatmentId as string,
            providerId: body.providerId,
            handoffId: body.handoffId,
            outcome: body.outcome,
            effectivenessRating: body.effectivenessRating,
            sideEffectsRating: body.sideEffectsRating,
            easeOfUseRating: body.easeOfUseRating,
            feedbackText: body.feedbackText,
            symptomsImproved: body.symptomsImproved,
            symptomsUnchanged: body.symptomsUnchanged,
            symptomsWorsened: body.symptomsWorsened,
            sideEffectsExperienced: body.sideEffectsExperienced,
            durationWeeks: body.durationWeeks,
            wouldContinue: body.wouldContinue,
            wouldRecommend: body.wouldRecommend,
            isAnonymous: body.isAnonymous,
            isPublic: body.isPublic,
        };

        const feedback = await treatmentFeedbackService.createFeedback(userId, dto);

        const response: ApiResponse<typeof feedback> = {
            success: true,
            data: feedback,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(201).json(response);
    })
);

/**
 * PUT /feedback/:feedbackId
 * Update existing feedback
 */
router.put(
    '/feedback/:feedbackId',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { feedbackId } = req.params;
        const userId = req.user!.userId;
        const body = req.body as UpdateTreatmentFeedbackDto;

        // Validate ratings if provided
        const ratings = [
            { name: 'effectivenessRating', value: body.effectivenessRating },
            { name: 'sideEffectsRating', value: body.sideEffectsRating },
            { name: 'easeOfUseRating', value: body.easeOfUseRating },
        ];

        for (const rating of ratings) {
            if (rating.value !== undefined && (rating.value < 1 || rating.value > 5)) {
                throw new ValidationError(`${rating.name} must be between 1 and 5`);
            }
        }

        const feedback = await treatmentFeedbackService.updateFeedback(userId, feedbackId as string, body);

        const response: ApiResponse<typeof feedback> = {
            success: true,
            data: feedback,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * DELETE /feedback/:feedbackId
 * Delete feedback
 */
router.delete(
    '/feedback/:feedbackId',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { feedbackId } = req.params;
        const userId = req.user!.userId;

        await treatmentFeedbackService.deleteFeedback(userId, feedbackId as string);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

/**
 * GET /user/feedback
 * Get all feedback by the current user
 */
router.get(
    '/user/feedback',
    authenticate,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.userId;
        const { page, limit, outcome } = req.query;

        const filters: TreatmentFeedbackFilters = {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 10,
            outcome: outcome as TreatmentFeedbackFilters['outcome'],
            treatmentId: undefined,
            providerId: undefined,
        };

        const result = await treatmentFeedbackService.getUserFeedback(userId, filters);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
            meta: { timestamp: new Date().toISOString() },
        };

        res.json(response);
    })
);

export default router;
