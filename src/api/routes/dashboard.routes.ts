import { Router, type Response } from 'express';

import { asyncHandler, NotFoundError } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  dashboardService,
  type UserDashboard,
  type UserProfileSummary,
  type HealthJourneySummary,
  type HandoffSummary,
  type ActivityItem,
} from '../../services/dashboard/dashboard.service.js';
import type { ApiResponse, AuthenticatedRequest } from '../../types/index.js';

const router = Router();

// ============================================
// Routes
// ============================================

/**
 * GET /dashboard
 * Get complete user dashboard with all sections
 *
 * Returns aggregated data including:
 * - Profile summary with completeness
 * - Health journey overview (intakes, recommendations, blood tests)
 * - Active provider handoffs
 * - Recent activity timeline
 * - Notification summary
 * - Quick stats
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const dashboard = await dashboardService.getDashboard(userId);

    const response: ApiResponse<UserDashboard> = {
      success: true,
      data: dashboard,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /dashboard/profile
 * Get user profile summary only
 *
 * Lightweight endpoint for header/nav components
 */
router.get(
  '/profile',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const profile = await dashboardService.getProfileSummary(userId);

    const response: ApiResponse<UserProfileSummary> = {
      success: true,
      data: profile,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /dashboard/health-journey
 * Get health journey summary only
 *
 * Returns overview of:
 * - Health intakes
 * - Recommendations
 * - Blood tests
 */
router.get(
  '/health-journey',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const healthJourney = await dashboardService.getHealthJourney(userId);

    const response: ApiResponse<HealthJourneySummary> = {
      success: true,
      data: healthJourney,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /dashboard/handoffs
 * Get active handoffs only
 *
 * Returns list of in-progress provider connections
 */
router.get(
  '/handoffs',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const handoffs = await dashboardService.getActiveHandoffs(userId);

    const response: ApiResponse<HandoffSummary[]> = {
      success: true,
      data: handoffs,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /dashboard/activity
 * Get recent activity timeline
 *
 * Query params:
 * - limit: number (default: 10, max: 50)
 */
router.get(
  '/activity',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    // Parse limit from query params
    let limit = 10;
    const queryLimit = (req.query as { limit?: string }).limit;
    if (queryLimit) {
      const parsed = parseInt(queryLimit, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50); // Cap at 50
      }
    }

    const activity = await dashboardService.getRecentActivity(userId, limit);

    const response: ApiResponse<ActivityItem[]> = {
      success: true,
      data: activity,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /dashboard/stats
 * Get quick stats for widgets
 *
 * Returns:
 * - Days as user
 * - Treatments explored
 * - Providers contacted
 * - Blood tests completed
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    // Get full dashboard to extract stats (could be optimized)
    const dashboard = await dashboardService.getDashboard(userId);

    const response: ApiResponse<typeof dashboard.quickStats> = {
      success: true,
      data: dashboard.quickStats,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
