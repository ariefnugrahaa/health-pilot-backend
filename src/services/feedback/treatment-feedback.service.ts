import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import type {
    CreateTreatmentFeedbackDto,
    UpdateTreatmentFeedbackDto,
    TreatmentFeedbackFilters,
    TreatmentFeedbackResponse,
    TreatmentFeedbackSummary,
    PaginatedResult,
    TreatmentFeedbackOutcome,
    ModerationStatus,
} from '../../types/feedback.types.js';

// ============================================
// Service Interface (SOLID - ISP)
// ============================================
export interface ITreatmentFeedbackService {
    createFeedback(userId: string, dto: CreateTreatmentFeedbackDto): Promise<TreatmentFeedbackResponse>;
    updateFeedback(userId: string, feedbackId: string, dto: UpdateTreatmentFeedbackDto): Promise<TreatmentFeedbackResponse>;
    deleteFeedback(userId: string, feedbackId: string): Promise<void>;
    getFeedbackById(feedbackId: string): Promise<TreatmentFeedbackResponse>;
    getTreatmentFeedback(treatmentId: string, filters: TreatmentFeedbackFilters): Promise<PaginatedResult<TreatmentFeedbackResponse>>;
    getProviderFeedback(providerId: string, filters: TreatmentFeedbackFilters): Promise<PaginatedResult<TreatmentFeedbackResponse>>;
    getUserFeedback(userId: string, filters: TreatmentFeedbackFilters): Promise<PaginatedResult<TreatmentFeedbackResponse>>;
    getTreatmentSummary(treatmentId: string): Promise<TreatmentFeedbackSummary>;
}

// ============================================
// Service Implementation
// ============================================
export class TreatmentFeedbackService implements ITreatmentFeedbackService {
    /**
     * Create new treatment feedback
     */
    async createFeedback(userId: string, dto: CreateTreatmentFeedbackDto): Promise<TreatmentFeedbackResponse> {
        logger.info('Creating treatment feedback', { userId, treatmentId: dto.treatmentId });

        // Validate ratings (1-5 scale)
        this.validateRatings(dto);

        // Check if treatment exists
        const treatment = await prisma.treatment.findUnique({
            where: { id: dto.treatmentId },
        });

        if (!treatment) {
            throw new NotFoundError('Treatment');
        }

        // Check if provider exists
        const provider = await prisma.provider.findUnique({
            where: { id: dto.providerId },
        });

        if (!provider) {
            throw new NotFoundError('Provider');
        }

        // Check for existing feedback (prevent duplicates)
        const existingFeedback = await prisma.treatmentFeedback.findFirst({
            where: {
                userId,
                treatmentId: dto.treatmentId,
                handoffId: dto.handoffId || null,
            },
        });

        if (existingFeedback) {
            throw new ValidationError('You have already provided feedback for this treatment');
        }

        // If handoffId provided, verify it belongs to user
        if (dto.handoffId) {
            const handoff = await prisma.providerHandoff.findFirst({
                where: { id: dto.handoffId, userId },
            });

            if (!handoff) {
                throw new ValidationError('Invalid handoff reference');
            }
        }

        // Create feedback
        const feedback = await prisma.treatmentFeedback.create({
            data: {
                userId,
                treatmentId: dto.treatmentId,
                providerId: dto.providerId,
                handoffId: dto.handoffId || null,
                outcome: dto.outcome,
                effectivenessRating: dto.effectivenessRating ?? null,
                sideEffectsRating: dto.sideEffectsRating ?? null,
                easeOfUseRating: dto.easeOfUseRating ?? null,
                feedbackText: dto.feedbackText ?? null,
                symptomsImproved: dto.symptomsImproved || [],
                symptomsUnchanged: dto.symptomsUnchanged || [],
                symptomsWorsened: dto.symptomsWorsened || [],
                sideEffectsExperienced: dto.sideEffectsExperienced || [],
                durationWeeks: dto.durationWeeks ?? null,
                wouldContinue: dto.wouldContinue ?? null,
                wouldRecommend: dto.wouldRecommend ?? null,
                isAnonymous: dto.isAnonymous !== false, // Default to anonymous
                isPublic: dto.isPublic === true, // Default to private
                moderationStatus: 'PENDING', // Require moderation before public
            },
        });

        // Update feedback summary
        await this.updateTreatmentSummary(dto.treatmentId);

        logger.info('Treatment feedback created', { feedbackId: feedback.id });

        return this.mapToResponse(feedback);
    }

    /**
     * Update existing feedback
     */
    async updateFeedback(
        userId: string,
        feedbackId: string,
        dto: UpdateTreatmentFeedbackDto
    ): Promise<TreatmentFeedbackResponse> {
        logger.info('Updating treatment feedback', { feedbackId, userId });

        const feedback = await prisma.treatmentFeedback.findFirst({
            where: { id: feedbackId, userId },
        });

        if (!feedback) {
            throw new NotFoundError('Feedback');
        }

        // Validate ratings if provided
        this.validateRatings(dto);

        const updated = await prisma.treatmentFeedback.update({
            where: { id: feedbackId },
            data: {
                ...(dto.outcome !== undefined && { outcome: dto.outcome }),
                ...(dto.effectivenessRating !== undefined && { effectivenessRating: dto.effectivenessRating }),
                ...(dto.sideEffectsRating !== undefined && { sideEffectsRating: dto.sideEffectsRating }),
                ...(dto.easeOfUseRating !== undefined && { easeOfUseRating: dto.easeOfUseRating }),
                ...(dto.feedbackText !== undefined && { feedbackText: dto.feedbackText }),
                ...(dto.symptomsImproved !== undefined && { symptomsImproved: dto.symptomsImproved }),
                ...(dto.symptomsUnchanged !== undefined && { symptomsUnchanged: dto.symptomsUnchanged }),
                ...(dto.symptomsWorsened !== undefined && { symptomsWorsened: dto.symptomsWorsened }),
                ...(dto.sideEffectsExperienced !== undefined && { sideEffectsExperienced: dto.sideEffectsExperienced }),
                ...(dto.durationWeeks !== undefined && { durationWeeks: dto.durationWeeks }),
                ...(dto.wouldContinue !== undefined && { wouldContinue: dto.wouldContinue }),
                ...(dto.wouldRecommend !== undefined && { wouldRecommend: dto.wouldRecommend }),
                ...(dto.isAnonymous !== undefined && { isAnonymous: dto.isAnonymous }),
                ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
                moderationStatus: dto.feedbackText && dto.feedbackText !== feedback.feedbackText
                    ? 'PENDING'
                    : feedback.moderationStatus,
            },
        });

        // Update summary
        await this.updateTreatmentSummary(feedback.treatmentId);

        logger.info('Treatment feedback updated', { feedbackId });

        return this.mapToResponse(updated);
    }

    /**
     * Delete feedback
     */
    async deleteFeedback(userId: string, feedbackId: string): Promise<void> {
        logger.info('Deleting treatment feedback', { feedbackId, userId });

        const feedback = await prisma.treatmentFeedback.findFirst({
            where: { id: feedbackId, userId },
        });

        if (!feedback) {
            throw new NotFoundError('Feedback');
        }

        await prisma.treatmentFeedback.delete({
            where: { id: feedbackId },
        });

        // Update summary
        await this.updateTreatmentSummary(feedback.treatmentId);

        logger.info('Treatment feedback deleted', { feedbackId });
    }

    /**
     * Get feedback by ID
     */
    async getFeedbackById(feedbackId: string): Promise<TreatmentFeedbackResponse> {
        const feedback = await prisma.treatmentFeedback.findUnique({
            where: { id: feedbackId },
            include: {
                user: { select: { firstName: true, lastName: true } },
                treatment: { select: { name: true, slug: true } },
                provider: { select: { name: true, slug: true } },
            },
        });

        if (!feedback) {
            throw new NotFoundError('Feedback');
        }

        return this.mapToResponse(feedback);
    }

    /**
     * Get all feedback for a treatment
     */
    async getTreatmentFeedback(
        treatmentId: string,
        filters: TreatmentFeedbackFilters
    ): Promise<PaginatedResult<TreatmentFeedbackResponse>> {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {
            treatmentId,
            moderationStatus: 'APPROVED',
            isPublic: true,
        };

        if (filters.outcome) {
            where.outcome = filters.outcome;
        }

        const [feedback, total] = await Promise.all([
            prisma.treatmentFeedback.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { firstName: true, lastName: true },
                    },
                    provider: {
                        select: { name: true, slug: true },
                    },
                },
            }),
            prisma.treatmentFeedback.count({ where }),
        ]);

        return {
            data: feedback.map((f) => this.mapToResponse(f)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get all feedback for a provider
     */
    async getProviderFeedback(
        providerId: string,
        filters: TreatmentFeedbackFilters
    ): Promise<PaginatedResult<TreatmentFeedbackResponse>> {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {
            providerId,
            moderationStatus: 'APPROVED',
            isPublic: true,
        };

        if (filters.outcome) {
            where.outcome = filters.outcome;
        }

        if (filters.treatmentId) {
            where.treatmentId = filters.treatmentId;
        }

        const [feedback, total] = await Promise.all([
            prisma.treatmentFeedback.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { firstName: true, lastName: true },
                    },
                    treatment: {
                        select: { name: true, slug: true },
                    },
                },
            }),
            prisma.treatmentFeedback.count({ where }),
        ]);

        return {
            data: feedback.map((f) => this.mapToResponse(f)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get all feedback by a user
     */
    async getUserFeedback(
        userId: string,
        filters: TreatmentFeedbackFilters
    ): Promise<PaginatedResult<TreatmentFeedbackResponse>> {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = { userId };

        if (filters.outcome) {
            where.outcome = filters.outcome;
        }

        const [feedback, total] = await Promise.all([
            prisma.treatmentFeedback.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    treatment: {
                        select: { name: true, slug: true },
                    },
                    provider: {
                        select: { name: true, slug: true, logoUrl: true },
                    },
                },
            }),
            prisma.treatmentFeedback.count({ where }),
        ]);

        return {
            data: feedback.map((f) => this.mapToResponse(f)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get treatment feedback summary
     */
    async getTreatmentSummary(treatmentId: string): Promise<TreatmentFeedbackSummary> {
        const summary = await prisma.treatmentFeedbackSummary.findUnique({
            where: { treatmentId },
        });

        if (!summary) {
            // Return empty summary if none exists
            return {
                treatmentId,
                providerId: '', // Will be populated from treatment
                avgEffectiveness: undefined,
                avgSideEffects: undefined,
                avgEaseOfUse: undefined,
                totalFeedback: 0,
                excellentCount: 0,
                goodCount: 0,
                neutralCount: 0,
                disappointingCount: 0,
                poorCount: 0,
                continuationRate: undefined,
                recommendationRate: undefined,
                commonImprovements: undefined,
                commonSideEffects: undefined,
            };
        }

        return {
            treatmentId: summary.treatmentId,
            providerId: summary.providerId,
            avgEffectiveness: summary.avgEffectiveness ? Number(summary.avgEffectiveness) : undefined,
            avgSideEffects: summary.avgSideEffects ? Number(summary.avgSideEffects) : undefined,
            avgEaseOfUse: summary.avgEaseOfUse ? Number(summary.avgEaseOfUse) : undefined,
            totalFeedback: summary.totalFeedback,
            excellentCount: summary.excellentCount,
            goodCount: summary.goodCount,
            neutralCount: summary.neutralCount,
            disappointingCount: summary.disappointingCount,
            poorCount: summary.poorCount,
            continuationRate: summary.continuationRate ? Number(summary.continuationRate) : undefined,
            recommendationRate: summary.recommendationRate ? Number(summary.recommendationRate) : undefined,
            commonImprovements: summary.commonImprovements || undefined,
            commonSideEffects: summary.commonSideEffects || undefined,
        };
    }

    /**
     * Validate rating values
     */
    private validateRatings(dto: CreateTreatmentFeedbackDto | UpdateTreatmentFeedbackDto): void {
        const ratings = [
            { name: 'effectivenessRating', value: dto.effectivenessRating },
            { name: 'sideEffectsRating', value: dto.sideEffectsRating },
            { name: 'easeOfUseRating', value: dto.easeOfUseRating },
        ];

        for (const rating of ratings) {
            if (rating.value !== undefined && (rating.value < 1 || rating.value > 5)) {
                throw new ValidationError(`${rating.name} must be between 1 and 5`);
            }
        }
    }

    /**
     * Update treatment feedback summary
     */
    private async updateTreatmentSummary(treatmentId: string): Promise<void> {
        const feedback = await prisma.treatmentFeedback.findMany({
            where: {
                treatmentId,
                moderationStatus: 'APPROVED',
            },
        });

        const totalFeedback = feedback.length;

        // Get treatment to get providerId
        const treatment = await prisma.treatment.findUnique({
            where: { id: treatmentId },
            select: { providerId: true },
        });

        if (!treatment) {
            return;
        }

        if (totalFeedback === 0) {
            await prisma.treatmentFeedbackSummary.upsert({
                where: { treatmentId },
                create: {
                    treatmentId,
                    providerId: treatment.providerId,
                    totalFeedback: 0,
                },
                update: {
                    totalFeedback: 0,
                    excellentCount: 0,
                    goodCount: 0,
                    neutralCount: 0,
                    disappointingCount: 0,
                    poorCount: 0,
                    continuationRate: 0,
                    recommendationRate: 0,
                    lastCalculatedAt: new Date(),
                },
            });
            return;
        }

        // Calculate averages
        const avgEffectiveness = this.calculateAverage(feedback.map((f) => f.effectivenessRating));
        const avgSideEffects = this.calculateAverage(feedback.map((f) => f.sideEffectsRating));
        const avgEaseOfUse = this.calculateAverage(feedback.map((f) => f.easeOfUseRating));

        // Count outcomes
        const outcomeCounts = {
            excellent: feedback.filter((f) => f.outcome === 'EXCELLENT').length,
            good: feedback.filter((f) => f.outcome === 'GOOD').length,
            neutral: feedback.filter((f) => f.outcome === 'NEUTRAL').length,
            disappointing: feedback.filter((f) => f.outcome === 'DISAPPOINTING').length,
            poor: feedback.filter((f) => f.outcome === 'POOR').length,
        };

        // Calculate rates
        const continuations = feedback.filter((f) => f.wouldContinue === true);
        const continuationRate = continuations.length / totalFeedback;

        const recommendations = feedback.filter((f) => f.wouldRecommend === true);
        const recommendationRate = recommendations.length / totalFeedback;

        // Aggregate common improvements and side effects
        const allImprovements = feedback.flatMap((f) => f.symptomsImproved || []);
        const allSideEffects = feedback.flatMap((f) => f.sideEffectsExperienced || []);

        const commonImprovements = this.getTopItems(allImprovements, 5);
        const commonSideEffects = this.getTopItems(allSideEffects, 5);

        await prisma.treatmentFeedbackSummary.upsert({
            where: { treatmentId },
            create: {
                treatmentId,
                providerId: treatment.providerId,
                avgEffectiveness: avgEffectiveness ?? null,
                avgSideEffects: avgSideEffects ?? null,
                avgEaseOfUse: avgEaseOfUse ?? null,
                totalFeedback,
                excellentCount: outcomeCounts.excellent,
                goodCount: outcomeCounts.good,
                neutralCount: outcomeCounts.neutral,
                disappointingCount: outcomeCounts.disappointing,
                poorCount: outcomeCounts.poor,
                continuationRate: continuationRate ?? null,
                recommendationRate: recommendationRate ?? null,
                commonImprovements,
                commonSideEffects,
            },
            update: {
                avgEffectiveness: avgEffectiveness ?? null,
                avgSideEffects: avgSideEffects ?? null,
                avgEaseOfUse: avgEaseOfUse ?? null,
                totalFeedback,
                excellentCount: outcomeCounts.excellent,
                goodCount: outcomeCounts.good,
                neutralCount: outcomeCounts.neutral,
                disappointingCount: outcomeCounts.disappointing,
                poorCount: outcomeCounts.poor,
                continuationRate: continuationRate ?? null,
                recommendationRate: recommendationRate ?? null,
                commonImprovements,
                commonSideEffects,
                lastCalculatedAt: new Date(),
            },
        });

        logger.info('Treatment feedback summary updated', { treatmentId, totalFeedback });
    }

    /**
     * Calculate average of valid ratings
     */
    private calculateAverage(ratings: (number | null)[]): number | undefined {
        const validRatings = ratings.filter((r): r is number => r !== null && r !== undefined);
        if (validRatings.length === 0) return undefined;
        return validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length;
    }

    /**
     * Get top N most common items from array
     */
    private getTopItems(items: string[], limit: number): string[] {
        const counts = new Map<string, number>();
        for (const item of items) {
            counts.set(item, (counts.get(item) || 0) + 1);
        }

        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([item]) => item);
    }

    /**
     * Map database model to response DTO
     */
    private mapToResponse(feedback: unknown): TreatmentFeedbackResponse {
        const f = feedback as {
            id: string;
            userId: string;
            treatmentId: string;
            providerId: string;
            handoffId?: string | null;
            outcome: string;
            effectivenessRating?: number | null;
            sideEffectsRating?: number | null;
            easeOfUseRating?: number | null;
            feedbackText?: string | null;
            symptomsImproved: string[];
            symptomsUnchanged: string[];
            symptomsWorsened: string[];
            sideEffectsExperienced: string[];
            durationWeeks?: number | null;
            wouldContinue?: boolean | null;
            wouldRecommend?: boolean | null;
            isAnonymous: boolean;
            isPublic: boolean;
            moderationStatus: string;
            createdAt: Date;
            updatedAt: Date;
            user?: { firstName?: string | null; lastName?: string | null };
            treatment?: { name: string; slug: string };
            provider?: { name: string; slug: string };
        };

        return {
            id: f.id,
            userId: f.userId,
            treatmentId: f.treatmentId,
            providerId: f.providerId,
            handoffId: f.handoffId || undefined,
            outcome: f.outcome as TreatmentFeedbackOutcome,
            effectivenessRating: f.effectivenessRating ?? undefined,
            sideEffectsRating: f.sideEffectsRating ?? undefined,
            easeOfUseRating: f.easeOfUseRating ?? undefined,
            feedbackText: f.feedbackText || undefined,
            symptomsImproved: f.symptomsImproved.length > 0 ? f.symptomsImproved : undefined,
            symptomsUnchanged: f.symptomsUnchanged.length > 0 ? f.symptomsUnchanged : undefined,
            symptomsWorsened: f.symptomsWorsened.length > 0 ? f.symptomsWorsened : undefined,
            sideEffectsExperienced: f.sideEffectsExperienced.length > 0 ? f.sideEffectsExperienced : undefined,
            durationWeeks: f.durationWeeks ?? undefined,
            wouldContinue: f.wouldContinue ?? undefined,
            wouldRecommend: f.wouldRecommend ?? undefined,
            isAnonymous: f.isAnonymous,
            isPublic: f.isPublic,
            moderationStatus: f.moderationStatus as ModerationStatus,
            createdAt: f.createdAt.toISOString(),
            updatedAt: f.updatedAt.toISOString(),
            user: f.user && !f.isAnonymous
                ? {
                    firstName: f.user.firstName || undefined,
                    lastName: f.user.lastName || undefined,
                }
                : undefined,
            treatment: f.treatment,
            provider: f.provider,
        };
    }
}

// Export singleton instance
export const treatmentFeedbackService = new TreatmentFeedbackService();
