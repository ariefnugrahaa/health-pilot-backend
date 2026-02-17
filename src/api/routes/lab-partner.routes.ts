import { Router, type Response, type Request } from 'express';
import { body, query, validationResult } from 'express-validator';

import { asyncHandler, NotFoundError, ValidationError } from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { auditPhiAccess } from '../middlewares/audit.middleware.js';
import { labPartnerService, ShippingAddress } from '../../services/lab/lab-partner.service.js';
import type { ApiResponse, AuthenticatedRequest } from '../../types/index.js';

const router = Router();

// ============================================
// Validation Middleware (inline)
// ============================================

function handleValidation(req: Request, _res: Response, next: () => void): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((error) => ({
      field: 'path' in error ? error.path : 'unknown',
      message: error.msg as string,
    }));
    throw new ValidationError(errorDetails[0]?.message || 'Validation failed', errorDetails);
  }
  next();
}

// ============================================
// Public Routes
// ============================================

/**
 * GET /lab-partners
 * Get available lab partners
 *
 * Query params:
 * - region: Filter by supported region (optional)
 */
router.get(
  '/',
  [query('region').optional().isString().trim()],
  handleValidation,
  asyncHandler(async (req: Request, res: Response) => {
    const region = typeof req.query['region'] === 'string' ? req.query['region'] : undefined;

    const partners = await labPartnerService.getAvailablePartners(region);

    const response: ApiResponse<typeof partners> = {
      success: true,
      data: partners,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /lab-partners/:id
 * Get specific lab partner details
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;

    const partner = await labPartnerService.getPartner(id);

    if (!partner) {
      throw new NotFoundError('Lab partner');
    }

    const response: ApiResponse<typeof partner> = {
      success: true,
      data: partner,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Authenticated Routes
// ============================================

/**
 * POST /lab-partners/:id/order
 * Order a test kit from a specific lab partner
 */
router.post(
  '/:id/order',
  authenticate,
  auditPhiAccess('lab_kit_order'),
  [
    body('bloodTestId').isUUID().withMessage('Valid blood test ID required'),
    body('shippingAddress.fullName').isString().trim().notEmpty().withMessage('Full name required'),
    body('shippingAddress.addressLine1')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Address line 1 required'),
    body('shippingAddress.addressLine2').optional().isString().trim(),
    body('shippingAddress.city').isString().trim().notEmpty().withMessage('City required'),
    body('shippingAddress.state').isString().trim().notEmpty().withMessage('State required'),
    body('shippingAddress.postalCode')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Postal code required'),
    body('shippingAddress.country').isString().trim().notEmpty().withMessage('Country required'),
    body('shippingAddress.phone').isString().trim().notEmpty().withMessage('Phone number required'),
    body('collectionPreference')
      .optional()
      .isIn(['home', 'clinic', 'mobile'])
      .withMessage('Invalid collection preference'),
  ],
  handleValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const labPartnerId = req.params['id'] as string;
    const { bloodTestId, shippingAddress, collectionPreference } = req.body as {
      bloodTestId: string;
      shippingAddress: ShippingAddress;
      collectionPreference?: 'home' | 'clinic' | 'mobile';
    };

    if (!userId) {
      throw new NotFoundError('User');
    }

    // Order kit through lab partner service
    const orderResponse = await labPartnerService.orderKit(
      bloodTestId,
      labPartnerId,
      shippingAddress,
      collectionPreference
    );

    const response: ApiResponse<typeof orderResponse> = {
      success: true,
      data: orderResponse,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /lab-partners/orders/:bloodTestId/status
 * Check status of a lab order
 */
router.get(
  '/orders/:bloodTestId/status',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const bloodTestId = req.params['bloodTestId'] as string;

    if (!userId) {
      throw new NotFoundError('User');
    }

    const status = await labPartnerService.checkOrderStatus(bloodTestId);

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /lab-partners/orders/:bloodTestId/cancel
 * Cancel a lab order
 */
router.post(
  '/orders/:bloodTestId/cancel',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const bloodTestId = req.params['bloodTestId'] as string;

    if (!userId) {
      throw new NotFoundError('User');
    }

    const cancelled = await labPartnerService.cancelOrder(bloodTestId);

    const response: ApiResponse<{ cancelled: boolean }> = {
      success: true,
      data: { cancelled },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Webhook Routes
// ============================================

/**
 * POST /lab-partners/webhooks/:partnerCode
 * Webhook endpoint for lab partners to send results
 *
 * This endpoint is called by lab partners when:
 * - Sample is received at lab
 * - Sample is being processed
 * - Results are ready
 * - An error occurred
 */
router.post(
  '/webhooks/:partnerCode',
  asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = req.params['partnerCode'] as string;
    const signatureHeader = req.headers['x-lab-signature'] || req.headers['x-webhook-signature'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : '';

    // Validate partner code
    const partner = await labPartnerService.getPartner(partnerCode);
    if (!partner) {
      throw new ValidationError(`Unknown lab partner: ${partnerCode}`);
    }

    // Process webhook
    await labPartnerService.processWebhook(partnerCode, req.body, signature);

    // Acknowledge receipt
    res.status(200).json({ success: true, received: true });
  })
);

export default router;
