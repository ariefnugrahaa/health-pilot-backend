import { Router, Response } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { handoffService } from '../../services/handoff/handoff.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router = Router();

/**
 * POST /handoffs
 * Initiate a handoff
 */
router.post(
  '/',
  authenticate,
  [body('recommendationId').isUUID(), body('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { recommendationId, treatmentId } = req.body;

    if (!userId) {
      throw new Error('Authentication required');
    }

    const handoffId = await handoffService.initiateHandoff(userId, recommendationId, treatmentId);

    res.status(201).json({
      success: true,
      data: { handoffId },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * GET /handoffs/:handoffId
 */
router.get(
  '/:handoffId',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const { handoffId } = req.params as { handoffId: string };

    if (!userId) {
      throw new Error('Authentication required');
    }

    const status = await handoffService.getHandoffStatus(handoffId, userId);

    res.status(200).json({
      success: true,
      data: status,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

export default router;
