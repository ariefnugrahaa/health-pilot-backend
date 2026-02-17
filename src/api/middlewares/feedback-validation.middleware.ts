import { body, param, query } from 'express-validator';

import validateRequest from './validation.middleware.js';

// ============================================
// Provider Rating Validations
// ============================================

/**
 * Validation rules for creating a provider rating
 */
export const createProviderRatingValidation = [
    body('rating')
        .exists({ checkFalsy: true })
        .withMessage('Rating is required')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('category')
        .optional()
        .isIn(['OVERALL', 'COMMUNICATION', 'PROFESSIONALISM', 'RESULTS', 'VALUE_FOR_MONEY'])
        .withMessage('Invalid category'),
    body('reviewTitle')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Review title must be between 3 and 100 characters'),
    body('reviewText')
        .optional()
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Review text must be between 10 and 2000 characters'),
    body('wouldRecommend')
        .optional()
        .isBoolean()
        .withMessage('wouldRecommend must be a boolean'),
    body('isPublic')
        .optional()
        .isBoolean()
        .withMessage('isPublic must be a boolean'),
    body('handoffId')
        .optional()
        .isUUID()
        .withMessage('Invalid handoff ID format'),
    validateRequest,
];

/**
 * Validation rules for updating a provider rating
 */
export const updateProviderRatingValidation = [
    body('rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('reviewTitle')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Review title must be between 3 and 100 characters'),
    body('reviewText')
        .optional()
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Review text must be between 10 and 2000 characters'),
    body('wouldRecommend')
        .optional()
        .isBoolean()
        .withMessage('wouldRecommend must be a boolean'),
    body('isPublic')
        .optional()
        .isBoolean()
        .withMessage('isPublic must be a boolean'),
    validateRequest,
];

/**
 * Validation rules for rating ID parameter
 */
export const ratingIdParamValidation = [
    param('ratingId').isUUID().withMessage('Invalid rating ID format'),
    validateRequest,
];

/**
 * Validation rules for provider ID parameter
 */
export const providerIdParamValidation = [
    param('providerId').isUUID().withMessage('Invalid provider ID format'),
    validateRequest,
];

/**
 * Validation rules for querying provider ratings
 */
export const getProviderRatingsValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('category')
        .optional()
        .isIn(['OVERALL', 'COMMUNICATION', 'PROFESSIONALISM', 'RESULTS', 'VALUE_FOR_MONEY'])
        .withMessage('Invalid category'),
    query('minRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('minRating must be between 1 and 5'),
    validateRequest,
];

/**
 * Validation rules for reporting a rating
 */
export const reportRatingValidation = [
    body('reason')
        .exists({ checkFalsy: true })
        .withMessage('Reason is required')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Reason must be between 10 and 500 characters'),
    validateRequest,
];

// ============================================
// Treatment Feedback Validations
// ============================================

/**
 * Validation rules for creating treatment feedback
 */
export const createTreatmentFeedbackValidation = [
    body('outcome')
        .exists({ checkFalsy: true })
        .withMessage('Outcome is required')
        .isIn(['EXCELLENT', 'GOOD', 'NEUTRAL', 'DISAPPOINTING', 'POOR'])
        .withMessage('Invalid outcome value'),
    body('providerId')
        .exists({ checkFalsy: true })
        .withMessage('Provider ID is required')
        .isUUID()
        .withMessage('Invalid provider ID format'),
    body('effectivenessRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Effectiveness rating must be between 1 and 5'),
    body('sideEffectsRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Side effects rating must be between 1 and 5'),
    body('easeOfUseRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Ease of use rating must be between 1 and 5'),
    body('feedbackText')
        .optional()
        .trim()
        .isLength({ min: 10, max: 3000 })
        .withMessage('Feedback text must be between 10 and 3000 characters'),
    body('symptomsImproved')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms improved must be an array with max 20 items')
        .custom((value: string[]) => value.every((item) => typeof item === 'string' && item.length <= 100))
        .withMessage('Each symptom must be a string with max 100 characters'),
    body('symptomsUnchanged')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms unchanged must be an array with max 20 items')
        .custom((value: string[]) => value.every((item) => typeof item === 'string' && item.length <= 100))
        .withMessage('Each symptom must be a string with max 100 characters'),
    body('symptomsWorsened')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms worsened must be an array with max 20 items')
        .custom((value: string[]) => value.every((item) => typeof item === 'string' && item.length <= 100))
        .withMessage('Each symptom must be a string with max 100 characters'),
    body('sideEffectsExperienced')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Side effects must be an array with max 20 items')
        .custom((value: string[]) => value.every((item) => typeof item === 'string' && item.length <= 100))
        .withMessage('Each side effect must be a string with max 100 characters'),
    body('durationWeeks')
        .optional()
        .isInt({ min: 1, max: 520 })
        .withMessage('Duration must be between 1 and 520 weeks (10 years)'),
    body('wouldContinue')
        .optional()
        .isBoolean()
        .withMessage('wouldContinue must be a boolean'),
    body('wouldRecommend')
        .optional()
        .isBoolean()
        .withMessage('wouldRecommend must be a boolean'),
    body('isAnonymous')
        .optional()
        .isBoolean()
        .withMessage('isAnonymous must be a boolean'),
    body('isPublic')
        .optional()
        .isBoolean()
        .withMessage('isPublic must be a boolean'),
    body('handoffId')
        .optional()
        .isUUID()
        .withMessage('Invalid handoff ID format'),
    validateRequest,
];

/**
 * Validation rules for updating treatment feedback
 */
export const updateTreatmentFeedbackValidation = [
    body('outcome')
        .optional()
        .isIn(['EXCELLENT', 'GOOD', 'NEUTRAL', 'DISAPPOINTING', 'POOR'])
        .withMessage('Invalid outcome value'),
    body('effectivenessRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Effectiveness rating must be between 1 and 5'),
    body('sideEffectsRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Side effects rating must be between 1 and 5'),
    body('easeOfUseRating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Ease of use rating must be between 1 and 5'),
    body('feedbackText')
        .optional()
        .trim()
        .isLength({ min: 10, max: 3000 })
        .withMessage('Feedback text must be between 10 and 3000 characters'),
    body('symptomsImproved')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms improved must be an array with max 20 items'),
    body('symptomsUnchanged')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms unchanged must be an array with max 20 items'),
    body('symptomsWorsened')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Symptoms worsened must be an array with max 20 items'),
    body('sideEffectsExperienced')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Side effects must be an array with max 20 items'),
    body('durationWeeks')
        .optional()
        .isInt({ min: 1, max: 520 })
        .withMessage('Duration must be between 1 and 520 weeks'),
    body('wouldContinue')
        .optional()
        .isBoolean()
        .withMessage('wouldContinue must be a boolean'),
    body('wouldRecommend')
        .optional()
        .isBoolean()
        .withMessage('wouldRecommend must be a boolean'),
    body('isAnonymous')
        .optional()
        .isBoolean()
        .withMessage('isAnonymous must be a boolean'),
    body('isPublic')
        .optional()
        .isBoolean()
        .withMessage('isPublic must be a boolean'),
    validateRequest,
];

/**
 * Validation rules for feedback ID parameter
 */
export const feedbackIdParamValidation = [
    param('feedbackId').isUUID().withMessage('Invalid feedback ID format'),
    validateRequest,
];

/**
 * Validation rules for treatment ID parameter
 */
export const treatmentIdParamValidation = [
    param('treatmentId').isUUID().withMessage('Invalid treatment ID format'),
    validateRequest,
];

/**
 * Validation rules for querying treatment feedback
 */
export const getTreatmentFeedbackValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('outcome')
        .optional()
        .isIn(['EXCELLENT', 'GOOD', 'NEUTRAL', 'DISAPPOINTING', 'POOR'])
        .withMessage('Invalid outcome value'),
    validateRequest,
];
