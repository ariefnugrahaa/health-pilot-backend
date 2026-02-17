// ============================================
// Feedback & Rating System Types
// ============================================

import type { PaginationMeta } from './index.js';

// ============================================
// Provider Rating Types
// ============================================

export type ProviderRatingCategory =
    | 'OVERALL'
    | 'COMMUNICATION'
    | 'PROFESSIONALISM'
    | 'RESULTS'
    | 'VALUE_FOR_MONEY';

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';

export interface CreateProviderRatingDto {
    providerId: string;
    handoffId: string | undefined;
    category: ProviderRatingCategory | undefined;
    rating: number;
    reviewTitle: string | undefined;
    reviewText: string | undefined;
    wouldRecommend: boolean | undefined;
    isPublic: boolean | undefined;
}

export interface UpdateProviderRatingDto {
    rating: number | undefined;
    reviewTitle: string | undefined;
    reviewText: string | undefined;
    wouldRecommend: boolean | undefined;
    isPublic: boolean | undefined;
}

export interface ProviderRatingFilters {
    page: number | undefined;
    limit: number | undefined;
    category: ProviderRatingCategory | undefined;
    minRating: number | undefined;
}

export interface ProviderRatingResponse {
    id: string;
    userId: string;
    providerId: string;
    handoffId: string | undefined;
    category: string;
    rating: number;
    reviewTitle: string | undefined;
    reviewText: string | undefined;
    wouldRecommend: boolean | undefined;
    isVerified: boolean;
    isPublic: boolean;
    helpfulCount: number;
    createdAt: string;
    updatedAt: string;
    user: {
        firstName: string | undefined;
        lastName: string | undefined;
    } | undefined;
    provider: {
        name: string;
        slug: string;
        logoUrl: string | undefined;
    } | undefined;
}

export interface ProviderRatingSummary {
    providerId: string;
    overallRating: number;
    communicationRating: number | undefined;
    professionalismRating: number | undefined;
    resultsRating: number | undefined;
    valueRating: number | undefined;
    totalReviews: number;
    fiveStarCount: number;
    fourStarCount: number;
    threeStarCount: number;
    twoStarCount: number;
    oneStarCount: number;
    recommendationRate: number | undefined;
}

// ============================================
// Treatment Feedback Types
// ============================================

export type TreatmentFeedbackOutcome = 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'DISAPPOINTING' | 'POOR';

export interface CreateTreatmentFeedbackDto {
    treatmentId: string;
    providerId: string;
    handoffId: string | undefined;
    outcome: TreatmentFeedbackOutcome;
    effectivenessRating: number | undefined;
    sideEffectsRating: number | undefined;
    easeOfUseRating: number | undefined;
    feedbackText: string | undefined;
    symptomsImproved: string[] | undefined;
    symptomsUnchanged: string[] | undefined;
    symptomsWorsened: string[] | undefined;
    sideEffectsExperienced: string[] | undefined;
    durationWeeks: number | undefined;
    wouldContinue: boolean | undefined;
    wouldRecommend: boolean | undefined;
    isAnonymous: boolean | undefined;
    isPublic: boolean | undefined;
}

export interface UpdateTreatmentFeedbackDto {
    outcome: TreatmentFeedbackOutcome | undefined;
    effectivenessRating: number | undefined;
    sideEffectsRating: number | undefined;
    easeOfUseRating: number | undefined;
    feedbackText: string | undefined;
    symptomsImproved: string[] | undefined;
    symptomsUnchanged: string[] | undefined;
    symptomsWorsened: string[] | undefined;
    sideEffectsExperienced: string[] | undefined;
    durationWeeks: number | undefined;
    wouldContinue: boolean | undefined;
    wouldRecommend: boolean | undefined;
    isAnonymous: boolean | undefined;
    isPublic: boolean | undefined;
}

export interface TreatmentFeedbackFilters {
    page: number | undefined;
    limit: number | undefined;
    outcome: TreatmentFeedbackOutcome | undefined;
    treatmentId: string | undefined;
    providerId: string | undefined;
}

export interface TreatmentFeedbackResponse {
    id: string;
    userId: string;
    treatmentId: string;
    providerId: string;
    handoffId: string | undefined;
    outcome: TreatmentFeedbackOutcome;
    effectivenessRating: number | undefined;
    sideEffectsRating: number | undefined;
    easeOfUseRating: number | undefined;
    feedbackText: string | undefined;
    symptomsImproved: string[] | undefined;
    symptomsUnchanged: string[] | undefined;
    symptomsWorsened: string[] | undefined;
    sideEffectsExperienced: string[] | undefined;
    durationWeeks: number | undefined;
    wouldContinue: boolean | undefined;
    wouldRecommend: boolean | undefined;
    isAnonymous: boolean;
    isPublic: boolean;
    moderationStatus: ModerationStatus;
    createdAt: string;
    updatedAt: string;
    user: {
        firstName: string | undefined;
        lastName: string | undefined;
    } | undefined;
    treatment: {
        name: string;
        slug: string;
    } | undefined;
    provider: {
        name: string;
        slug: string;
    } | undefined;
}

export interface TreatmentFeedbackSummary {
    treatmentId: string;
    providerId: string;
    avgEffectiveness: number | undefined;
    avgSideEffects: number | undefined;
    avgEaseOfUse: number | undefined;
    totalFeedback: number;
    excellentCount: number;
    goodCount: number;
    neutralCount: number;
    disappointingCount: number;
    poorCount: number;
    continuationRate: number | undefined;
    recommendationRate: number | undefined;
    commonImprovements: string[] | undefined;
    commonSideEffects: string[] | undefined;
}

// ============================================
// Common Types
// ============================================

export interface PaginatedResult<T> {
    data: T[];
    meta: PaginationMeta;
}

export interface ReportRatingDto {
    reason: string;
}
