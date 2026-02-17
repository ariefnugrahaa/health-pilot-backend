import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import type {
    CreateProviderRatingDto,
    UpdateProviderRatingDto,
    ProviderRatingFilters,
    ProviderRatingResponse,
    ProviderRatingSummary,
    PaginatedResult,
} from '../../types/feedback.types.js';

// ============================================
// Service Interface (SOLID - ISP)
// ============================================
export interface IProviderRatingService {
    createRating(userId: string, dto: CreateProviderRatingDto): Promise<ProviderRatingResponse>;
    updateRating(userId: string, ratingId: string, dto: UpdateProviderRatingDto): Promise<ProviderRatingResponse>;
    deleteRating(userId: string, ratingId: string): Promise<void>;
    getRatingById(ratingId: string): Promise<ProviderRatingResponse>;
    getProviderRatings(providerId: string, filters: ProviderRatingFilters): Promise<PaginatedResult<ProviderRatingResponse>>;
    getUserRatings(userId: string, filters: ProviderRatingFilters): Promise<PaginatedResult<ProviderRatingResponse>>;
    getProviderSummary(providerId: string): Promise<ProviderRatingSummary>;
    markHelpful(userId: string, ratingId: string): Promise<void>;
    reportRating(userId: string, ratingId: string, reason: string): Promise<void>;
}

// ============================================
// Service Implementation
// ============================================
export class ProviderRatingService implements IProviderRatingService {
    /**
     * Create a new provider rating
     */
    async createRating(userId: string, dto: CreateProviderRatingDto): Promise<ProviderRatingResponse> {
        logger.info('Creating provider rating', { userId, providerId: dto.providerId });

        // Validate rating value
        if (dto.rating < 1 || dto.rating > 5) {
            throw new ValidationError('Rating must be between 1 and 5');
        }

        // Check if provider exists
        const provider = await prisma.provider.findUnique({
            where: { id: dto.providerId },
        });

        if (!provider) {
            throw new NotFoundError('Provider');
        }

        // Check for existing rating (prevent duplicates)
        const existingRating = await prisma.providerRating.findFirst({
            where: {
                userId,
                providerId: dto.providerId,
                category: dto.category || 'OVERALL',
                handoffId: dto.handoffId || null,
            },
        });

        if (existingRating) {
            throw new ValidationError('You have already rated this provider for this category');
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

        // Create rating
        const rating = await prisma.providerRating.create({
            data: {
                userId,
                providerId: dto.providerId,
                handoffId: dto.handoffId || null,
                category: dto.category || 'OVERALL',
                rating: dto.rating,
                reviewTitle: dto.reviewTitle ?? null,
                reviewText: dto.reviewText ?? null,
                wouldRecommend: dto.wouldRecommend ?? null,
                isVerified: !!dto.handoffId, // Verified if from actual handoff
                isPublic: dto.isPublic !== false, // Default to public
            },
        });

        // Update rating summary
        await this.updateProviderSummary(dto.providerId);

        logger.info('Provider rating created', { ratingId: rating.id });

        return this.mapToResponse(rating);
    }

    /**
     * Update an existing rating
     */
    async updateRating(
        userId: string,
        ratingId: string,
        dto: UpdateProviderRatingDto
    ): Promise<ProviderRatingResponse> {
        logger.info('Updating provider rating', { ratingId, userId });

        const rating = await prisma.providerRating.findFirst({
            where: { id: ratingId, userId },
        });

        if (!rating) {
            throw new NotFoundError('Rating');
        }

        // Validate rating value if provided
        if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
            throw new ValidationError('Rating must be between 1 and 5');
        }

        const updated = await prisma.providerRating.update({
            where: { id: ratingId },
            data: {
                ...(dto.rating !== undefined && { rating: dto.rating }),
                ...(dto.reviewTitle !== undefined && { reviewTitle: dto.reviewTitle }),
                ...(dto.reviewText !== undefined && { reviewText: dto.reviewText }),
                ...(dto.wouldRecommend !== undefined && { wouldRecommend: dto.wouldRecommend }),
                ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
                moderationStatus: dto.reviewText || dto.reviewTitle ? 'PENDING' : rating.moderationStatus,
            },
        });

        // Update summary
        await this.updateProviderSummary(rating.providerId);

        logger.info('Provider rating updated', { ratingId });

        return this.mapToResponse(updated);
    }

    /**
     * Delete a rating
     */
    async deleteRating(userId: string, ratingId: string): Promise<void> {
        logger.info('Deleting provider rating', { ratingId, userId });

        const rating = await prisma.providerRating.findFirst({
            where: { id: ratingId, userId },
        });

        if (!rating) {
            throw new NotFoundError('Rating');
        }

        await prisma.providerRating.delete({
            where: { id: ratingId },
        });

        // Update summary
        await this.updateProviderSummary(rating.providerId);

        logger.info('Provider rating deleted', { ratingId });
    }

    /**
     * Get rating by ID
     */
    async getRatingById(ratingId: string): Promise<ProviderRatingResponse> {
        const rating = await prisma.providerRating.findUnique({
            where: { id: ratingId },
            include: { user: { select: { firstName: true, lastName: true } } },
        });

        if (!rating) {
            throw new NotFoundError('Rating');
        }

        return this.mapToResponse(rating);
    }

    /**
     * Get all ratings for a provider
     */
    async getProviderRatings(
        providerId: string,
        filters: ProviderRatingFilters
    ): Promise<PaginatedResult<ProviderRatingResponse>> {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {
            providerId,
            moderationStatus: 'APPROVED',
            isPublic: true,
        };

        if (filters.category) {
            where.category = filters.category;
        }

        if (filters.minRating) {
            where.rating = { gte: filters.minRating };
        }

        const [ratings, total] = await Promise.all([
            prisma.providerRating.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { firstName: true, lastName: true },
                    },
                },
            }),
            prisma.providerRating.count({ where }),
        ]);

        return {
            data: ratings.map((r) => this.mapToResponse(r)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get all ratings by a user
     */
    async getUserRatings(
        userId: string,
        filters: ProviderRatingFilters
    ): Promise<PaginatedResult<ProviderRatingResponse>> {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = { userId };

        if (filters.category) {
            where.category = filters.category;
        }

        const [ratings, total] = await Promise.all([
            prisma.providerRating.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    provider: {
                        select: { name: true, slug: true, logoUrl: true },
                    },
                },
            }),
            prisma.providerRating.count({ where }),
        ]);

        return {
            data: ratings.map((r) => this.mapToResponse(r)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get provider rating summary
     */
    async getProviderSummary(providerId: string): Promise<ProviderRatingSummary> {
        const summary = await prisma.providerRatingSummary.findUnique({
            where: { providerId },
        });

        if (!summary) {
            // Return empty summary if none exists
            return {
                providerId,
                overallRating: 0,
                totalReviews: 0,
                fiveStarCount: 0,
                fourStarCount: 0,
                threeStarCount: 0,
                twoStarCount: 0,
                oneStarCount: 0,
                recommendationRate: 0,
                communicationRating: undefined,
                professionalismRating: undefined,
                resultsRating: undefined,
                valueRating: undefined,
            };
        }

        return {
            providerId: summary.providerId,
            overallRating: Number(summary.overallRating),
            communicationRating: summary.communicationRating ? Number(summary.communicationRating) : undefined,
            professionalismRating: summary.professionalismRating ? Number(summary.professionalismRating) : undefined,
            resultsRating: summary.resultsRating ? Number(summary.resultsRating) : undefined,
            valueRating: summary.valueRating ? Number(summary.valueRating) : undefined,
            totalReviews: summary.totalReviews,
            fiveStarCount: summary.fiveStarCount,
            fourStarCount: summary.fourStarCount,
            threeStarCount: summary.threeStarCount,
            twoStarCount: summary.twoStarCount,
            oneStarCount: summary.oneStarCount,
            recommendationRate: summary.recommendationRate ? Number(summary.recommendationRate) : undefined,
        };
    }

    /**
     * Mark a rating as helpful
     */
    async markHelpful(userId: string, ratingId: string): Promise<void> {
        // In a real implementation, you'd track which users marked which ratings
        // to prevent duplicate helpful marks. For now, just increment.
        await prisma.providerRating.update({
            where: { id: ratingId },
            data: { helpfulCount: { increment: 1 } },
        });

        logger.info('Rating marked as helpful', { ratingId, userId });
    }

    /**
     * Report a rating for moderation
     */
    async reportRating(userId: string, ratingId: string, reason: string): Promise<void> {
        const rating = await prisma.providerRating.findUnique({
            where: { id: ratingId },
        });

        if (!rating) {
            throw new NotFoundError('Rating');
        }

        await prisma.providerRating.update({
            where: { id: ratingId },
            data: {
                reportedCount: { increment: 1 },
                moderationStatus: rating.reportedCount >= 2 ? 'UNDER_REVIEW' : rating.moderationStatus,
            },
        });

        // TODO: Create moderation ticket/notification
        logger.info('Rating reported', { ratingId, userId, reason });
    }

    /**
     * Update provider rating summary (called after create/update/delete)
     */
    private async updateProviderSummary(providerId: string): Promise<void> {
        const ratings = await prisma.providerRating.findMany({
            where: {
                providerId,
                moderationStatus: 'APPROVED',
            },
        });

        const totalReviews = ratings.length;

        if (totalReviews === 0) {
            await prisma.providerRatingSummary.upsert({
                where: { providerId },
                create: {
                    providerId,
                    overallRating: 0,
                    totalReviews: 0,
                },
                update: {
                    overallRating: 0,
                    totalReviews: 0,
                    fiveStarCount: 0,
                    fourStarCount: 0,
                    threeStarCount: 0,
                    twoStarCount: 0,
                    oneStarCount: 0,
                    recommendationRate: 0,
                    lastCalculatedAt: new Date(),
                },
            });
            return;
        }

        // Calculate category averages
        const categories = ['OVERALL', 'COMMUNICATION', 'PROFESSIONALISM', 'RESULTS', 'VALUE_FOR_MONEY'];
        const categoryAverages: Record<string, number> = {};

        for (const category of categories) {
            const categoryRatings = ratings.filter((r) => r.category === category);
            if (categoryRatings.length > 0) {
                const avg = categoryRatings.reduce((sum, r) => sum + r.rating, 0) / categoryRatings.length;
                categoryAverages[category] = avg;
            }
        }

        // Count star distribution
        const starCounts = {
            five: ratings.filter((r) => r.rating === 5).length,
            four: ratings.filter((r) => r.rating === 4).length,
            three: ratings.filter((r) => r.rating === 3).length,
            two: ratings.filter((r) => r.rating === 2).length,
            one: ratings.filter((r) => r.rating === 1).length,
        };

        // Calculate recommendation rate
        const recommendations = ratings.filter((r) => r.wouldRecommend === true);
        const recommendationRate = recommendations.length / totalReviews;

        await prisma.providerRatingSummary.upsert({
            where: { providerId },
            create: {
                providerId,
                overallRating: categoryAverages['OVERALL'] || 0,
                communicationRating: categoryAverages['COMMUNICATION'] ?? null,
                professionalismRating: categoryAverages['PROFESSIONALISM'] ?? null,
                resultsRating: categoryAverages['RESULTS'] ?? null,
                valueRating: categoryAverages['VALUE_FOR_MONEY'] ?? null,
                totalReviews,
                fiveStarCount: starCounts.five,
                fourStarCount: starCounts.four,
                threeStarCount: starCounts.three,
                twoStarCount: starCounts.two,
                oneStarCount: starCounts.one,
                recommendationRate,
            },
            update: {
                overallRating: categoryAverages['OVERALL'] || 0,
                communicationRating: categoryAverages['COMMUNICATION'] ?? null,
                professionalismRating: categoryAverages['PROFESSIONALISM'] ?? null,
                resultsRating: categoryAverages['RESULTS'] ?? null,
                valueRating: categoryAverages['VALUE_FOR_MONEY'] ?? null,
                totalReviews,
                fiveStarCount: starCounts.five,
                fourStarCount: starCounts.four,
                threeStarCount: starCounts.three,
                twoStarCount: starCounts.two,
                oneStarCount: starCounts.one,
                recommendationRate,
                lastCalculatedAt: new Date(),
            },
        });

        logger.info('Provider rating summary updated', { providerId, totalReviews });
    }

    /**
     * Map database model to response DTO
     */
    private mapToResponse(rating: unknown): ProviderRatingResponse {
        const r = rating as {
            id: string;
            userId: string;
            providerId: string;
            handoffId?: string | null;
            category: string;
            rating: number;
            reviewTitle?: string | null;
            reviewText?: string | null;
            wouldRecommend?: boolean | null;
            isVerified: boolean;
            isPublic: boolean;
            helpfulCount: number;
            createdAt: Date;
            updatedAt: Date;
            user?: { firstName?: string | null; lastName?: string | null };
            provider?: { name: string; slug: string; logoUrl?: string | null };
        };

        return {
            id: r.id,
            userId: r.userId,
            providerId: r.providerId,
            handoffId: r.handoffId || undefined,
            category: r.category,
            rating: r.rating,
            reviewTitle: r.reviewTitle || undefined,
            reviewText: r.reviewText || undefined,
            wouldRecommend: r.wouldRecommend ?? undefined,
            isVerified: r.isVerified,
            isPublic: r.isPublic,
            helpfulCount: r.helpfulCount,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            user: r.user
                ? {
                    firstName: r.user.firstName || undefined,
                    lastName: r.user.lastName || undefined,
                }
                : undefined,
            provider: r.provider
                ? {
                    name: r.provider.name,
                    slug: r.provider.slug,
                    logoUrl: r.provider.logoUrl ?? undefined,
                }
                : undefined,
        };
    }
}

// Export singleton instance
export const providerRatingService = new ProviderRatingService();
