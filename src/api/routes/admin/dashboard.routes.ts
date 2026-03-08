import { Router, type Response } from 'express';

import { authenticate, requireAdmin } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
  adminDashboardService,
  type AdminDashboardData,
} from '../../../services/admin/admin-dashboard.service.js';
import type { ApiResponse, AuthenticatedRequest } from '../../../types/index.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(
    async (_req: AuthenticatedRequest, res: Response<ApiResponse<AdminDashboardData>>) => {
      const dashboard = await adminDashboardService.getDashboardData();

      res.status(200).json({
        success: true,
        data: dashboard,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  )
);

export default router;
