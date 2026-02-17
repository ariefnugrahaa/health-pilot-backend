import { Router, type Response } from 'express';
import {
  analyticsService,
  type ProviderPerformanceMetrics,
  type MarketBenchmarks,
} from '../../services/analytics/analytics.service.js';
import { authenticate, requireRoles } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import type { AuthenticatedRequest, ApiResponse } from '../../types/index.js';

const router = Router();

// ============================================
// Provider Analytics Endpoints
// ============================================

/**
 * GET /api/analytics/provider/:providerId/performance
 * Get provider performance metrics
 * Requires: PROVIDER_ADMIN (own provider) or ADMIN
 */
router.get(
  '/provider/:providerId/performance',
  authenticate,
  requireRoles('PROVIDER_ADMIN', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(
    async (req: AuthenticatedRequest, res: Response<ApiResponse<ProviderPerformanceMetrics>>) => {
      const providerId = req.params.providerId as string;

      // TODO: For PROVIDER_ADMIN, verify they belong to this provider
      // This is a simplified version - production should check provider ownership

      const metrics = await analyticsService.getProviderPerformance(providerId);

      res.json({
        success: true,
        data: metrics,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  )
);

/**
 * GET /api/analytics/market/benchmarks
 * Get market-wide benchmarks (aggregated, anonymized)
 * Requires: ADMIN or SUPER_ADMIN
 */
router.get(
  '/market/benchmarks',
  authenticate,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response<ApiResponse<MarketBenchmarks>>) => {
    const benchmarks = await analyticsService.getMarketBenchmarks();

    res.json({
      success: true,
      data: benchmarks,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/analytics/provider/:providerId/snapshot
 * Trigger snapshot generation for a provider (admin only)
 * Used for manual snapshot triggers - normally run by scheduled job
 * Requires: ADMIN or SUPER_ADMIN
 */
router.post(
  '/provider/:providerId/snapshot',
  authenticate,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(
    async (req: AuthenticatedRequest, res: Response<ApiResponse<{ message: string }>>) => {
      const providerId = req.params.providerId as string;
      const snapshotDate = req.body.date ? new Date(req.body.date as string) : new Date();

      await analyticsService.generateProviderSnapshot(providerId, snapshotDate);

      res.json({
        success: true,
        data: {
          message: `Snapshot generated for provider ${providerId} on ${snapshotDate.toISOString().split('T')[0]}`,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  )
);

// ============================================
// Aggregate Analytics Endpoints (For Dashboards)
// ============================================

/**
 * GET /api/analytics/overview
 * Get platform-wide analytics overview
 * Requires: ADMIN or SUPER_ADMIN
 */
router.get(
  '/overview',
  authenticate,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(
    async (
      _req: AuthenticatedRequest,
      res: Response<
        ApiResponse<{
          marketBenchmarks: MarketBenchmarks;
          topProviders: ProviderPerformanceMetrics[];
        }>
      >
    ) => {
      const benchmarks = await analyticsService.getMarketBenchmarks();

      // For now, return benchmarks only
      // Top providers feature would require additional method implementation

      res.json({
        success: true,
        data: {
          marketBenchmarks: benchmarks,
          topProviders: [], // TODO: Implement getTopProviders
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  )
);

export default router;
