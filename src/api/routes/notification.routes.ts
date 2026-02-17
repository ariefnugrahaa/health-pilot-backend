import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  notificationService,
  sendWelcomeEmail,
} from '../../services/notification/notification.service.js';
import { asyncHandler, ValidationError, ForbiddenError } from '../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router = Router();

// ============================================
// Notification Routes
// ============================================

/**
 * GET /api/v1/notifications
 * Get user's notifications
 */
router.get(
  '/',
  authenticate,
  query('limit').optional().isInt({ min: 1, max: 100 }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const limitParam = req.query['limit'];
    const limit = typeof limitParam === 'string' ? parseInt(limitParam) : 50;
    const notifications = await notificationService.getUserNotifications(userId, limit);

    res.json({
      success: true,
      data: { notifications },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /api/v1/notifications/:id/read
 * Mark a notification as read
 */
router.post(
  '/:id/read',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const notificationId = req.params['id'];

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    if (!notificationId) {
      throw new ValidationError('Notification ID required');
    }

    await notificationService.markAsRead(notificationId as string, userId);

    res.json({
      success: true,
      data: { message: 'Notification marked as read' },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /api/v1/notifications/send
 * Send a notification (admin only)
 */
router.post(
  '/send',
  authenticate,
  body('userId').isUUID(),
  body('channel').isIn(['email', 'push', 'sms', 'in_app']),
  body('type').isString().notEmpty(),
  body('title').isString().notEmpty(),
  body('body').isString().notEmpty(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({ field: e.type, message: e.msg }))
      );
    }

    // Check if admin
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    const { userId, channel, type, title, body: notifBody, priority } = req.body;

    const result = await notificationService.send({
      userId,
      channel,
      type,
      title,
      body: notifBody,
      priority: priority || 'normal',
    });

    res.json({
      success: result.success,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /api/v1/notifications/welcome
 * Send welcome email to user
 */
router.post(
  '/welcome',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const result = await sendWelcomeEmail(userId);

    res.json({
      success: result.success,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * POST /api/v1/notifications/schedule
 * Schedule a notification for later
 */
router.post(
  '/schedule',
  authenticate,
  body('userId').isUUID(),
  body('channel').isIn(['email', 'push', 'sms', 'in_app']),
  body('type').isString().notEmpty(),
  body('title').isString().notEmpty(),
  body('body').isString().notEmpty(),
  body('sendAt').isISO8601(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({ field: e.type, message: e.msg }))
      );
    }

    // Only admins can schedule notifications for other users
    const { userId, channel, type, title, body: notifBody, sendAt } = req.body;

    if (
      userId !== req.user?.userId &&
      req.user?.role !== 'ADMIN' &&
      req.user?.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenError('Cannot schedule notifications for other users');
    }

    const notificationId = await notificationService.scheduleNotification(
      { userId, channel, type, title, body: notifBody },
      new Date(sendAt)
    );

    res.json({
      success: true,
      data: { notificationId, scheduledFor: sendAt },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

/**
 * DELETE /api/v1/notifications/schedule/:id
 * Cancel a scheduled notification
 */
router.delete(
  '/schedule/:id',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const notificationId = req.params['id'];

    if (!notificationId) {
      throw new ValidationError('Notification ID required');
    }

    const cancelled = await notificationService.cancelScheduledNotification(
      notificationId as string
    );

    res.json({
      success: cancelled,
      data: { cancelled },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

export default router;
