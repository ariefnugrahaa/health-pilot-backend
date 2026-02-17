import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { asyncHandler, ValidationError } from '../../middlewares/error.middleware.js';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware.js';
import { attributionService } from '../../../services/attribution/attribution.service.js';
import type { AuthenticatedRequest, ApiResponse } from '../../../types/index.js';

const router = Router();

// ============================================
// Provider Routes (Webhook endpoints)
// ============================================

/**
 * POST /attribution/events
 * Record an attribution event (from provider webhook)
 *
 * This endpoint is called by providers to report treatment starts,
 * subscription renewals, and other revenue events.
 */
router.post(
  '/events',
  // In production: use API key authentication for providers
  // For now, require admin auth
  authenticate,
  requireAdmin,
  [
    body('handoffId').isUUID().withMessage('Handoff ID must be a valid UUID'),
    body('eventType')
      .isIn([
        'lead_received',
        'consultation_scheduled',
        'treatment_started',
        'subscription_created',
        'subscription_renewed',
        'subscription_cancelled',
        'treatment_completed',
      ])
      .withMessage('Invalid event type'),
    body('revenueAmount').optional().isFloat({ min: 0 }),
    body('currency').optional().isIn(['GBP', 'USD', 'EUR']),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { handoffId, eventType, revenueAmount, currency, metadata } = req.body;

    const eventId = await attributionService.trackEvent({
      handoffId,
      eventType,
      revenueAmount,
      currency,
      metadata,
    });

    const response: ApiResponse<{ eventId: string }> = {
      success: true,
      data: { eventId },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * POST /attribution/treatment-start
 * Specific endpoint for recording treatment start
 */
router.post(
  '/treatment-start',
  authenticate,
  requireAdmin,
  [
    body('handoffId').isUUID(),
    body('revenueAmount').isFloat({ min: 0 }).withMessage('Revenue amount is required'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { handoffId, revenueAmount } = req.body;

    await attributionService.recordTreatmentStart(handoffId, revenueAmount);

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /attribution/subscription-renewal
 * Record a subscription renewal event
 */
router.post(
  '/subscription-renewal',
  authenticate,
  requireAdmin,
  [body('handoffId').isUUID(), body('revenueAmount').isFloat({ min: 0 })],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { handoffId, revenueAmount } = req.body;

    await attributionService.recordSubscriptionRenewal(handoffId, revenueAmount);

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Report Routes (Admin)
// ============================================

/**
 * GET /attribution/reports/provider/:providerId
 * Get attribution report for a specific provider
 */
router.get(
  '/reports/provider/:providerId',
  authenticate,
  requireAdmin,
  [
    param('providerId').isUUID(),
    query('startDate').isISO8601().withMessage('Start date must be ISO 8601 format'),
    query('endDate').isISO8601().withMessage('End date must be ISO 8601 format'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { providerId } = req.params as { providerId: string };
    const { startDate, endDate } = req.query as { startDate: string; endDate: string };

    const report = await attributionService.getProviderReport(
      providerId,
      new Date(startDate),
      new Date(endDate)
    );

    const response: ApiResponse<typeof report> = {
      success: true,
      data: report,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /attribution/calculate-commission
 * Calculate commission for a given amount and provider
 */
router.get(
  '/calculate-commission',
  authenticate,
  requireAdmin,
  [query('providerId').isUUID(), query('amount').isFloat({ min: 0 })],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { providerId, amount } = req.query as { providerId: string; amount: string };

    const commission = await attributionService.calculateCommission(parseFloat(amount), providerId);

    const response: ApiResponse<{
      revenueAmount: number;
      commissionAmount: number;
      netAmount: number;
    }> = {
      success: true,
      data: {
        revenueAmount: parseFloat(amount),
        commissionAmount: commission,
        netAmount: parseFloat(amount) - commission,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
