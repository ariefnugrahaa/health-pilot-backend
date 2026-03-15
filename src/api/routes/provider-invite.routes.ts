import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { randomBytes } from 'crypto';
import type { ProviderCategory } from '@prisma/client';

import { prisma } from '../../utils/database.js';
import {
  asyncHandler,
  ValidationError,
} from '../middlewares/error.middleware.js';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
import type { AuthenticatedRequest, ApiResponse } from '../../types/index.js';
import { PROVIDER_CATEGORY_VALUES, isProviderCategory } from '../../constants/provider-categories.js';

const router = Router();

// ============================================
// Helper Functions
// ============================================

function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function getBaseUrl(): string {
  return process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// ============================================
// Validation
// ============================================

const generateInviteValidation = [
  body('category').optional().isIn(PROVIDER_CATEGORY_VALUES).withMessage('Valid category is required'),
  body('email').optional().isEmail().withMessage('Valid email is required if provided'),
  body('expiresInDays').optional().isInt({ min: 1, max: 90 }).withMessage('Expires in days must be between 1 and 90'),
  body('isReusable').optional().isBoolean().withMessage('isReusable must be a boolean'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
];

const submitOnboardingValidation = [
  body('name').isString().notEmpty().withMessage('Provider name is required'),
  body('category').optional().isIn(PROVIDER_CATEGORY_VALUES).withMessage('Valid category is required'),
  body('businessName').optional().isString(),
  body('providerType').isString().notEmpty().withMessage('Provider type is required'),
  body('description').optional().isString(),
  body('websiteUrl').optional().isURL(),
  body('logoUrl').optional().isURL(),
  body('contactEmail').isEmail().withMessage('Valid contact email is required'),
  body('contactPhone').isString().notEmpty().withMessage('Contact phone is required'),
  body('registrationNumber').optional().isString(),
  body('supportedRegions').isArray({ min: 1 }).withMessage('At least one region is required'),
  body('acceptsBloodTests').optional().isBoolean(),
  body('apiEndpoint').optional().isURL(),
  body('webhookUrl').optional().isURL(),
  body('affiliateLink').optional().isURL(),
  body('commissionRate').optional().isFloat({ min: 0, max: 100 }),
  body('subscriptionShare').optional().isFloat({ min: 0, max: 100 }),
];

// ============================================
// Admin Routes (require authentication)
// ============================================

/**
 * POST /providers/invite/generate
 * Generate a new provider invite link (admin only)
 */
router.post(
  '/generate',
  authenticate,
  requireAdmin,
  generateInviteValidation,
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

    const { category, email, expiresInDays = 7, isReusable = false, notes } = req.body as {
      category?: ProviderCategory;
      email?: string;
      expiresInDays?: number;
      isReusable?: boolean;
      notes?: string;
    };

    // Check if there's an existing unused invite for this email (only if email is provided)
    if (email) {
      const existingInvite = await prisma.providerInvite.findFirst({
        where: {
          email: email.toLowerCase(),
          usedAt: null,
          expiresAt: { gte: new Date() },
        },
      });

      if (existingInvite) {
        // Return existing invite
        const inviteUrl = `${getBaseUrl()}/onboarding/${existingInvite.token}`;
        const response: ApiResponse<{
          inviteId: string;
          inviteToken: string;
          inviteUrl: string;
          expiresAt: string;
          category: string | null;
        }> = {
          success: true,
          data: {
            inviteId: existingInvite.id,
            inviteToken: existingInvite.token,
            inviteUrl,
            expiresAt: existingInvite.expiresAt.toISOString(),
            category: existingInvite.category,
          },
          meta: { timestamp: new Date().toISOString() },
        };
        res.status(200).json(response);
        return;
      }
    }

    // Generate new invite
    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invite = await prisma.providerInvite.create({
      data: {
        email: email?.toLowerCase() || null,
        token,
        category: category ?? null,
        expiresAt,
        createdById: req.user?.userId || null,
        isReusable,
        notes: notes || null,
      },
    });

    const inviteUrl = `${getBaseUrl()}/onboarding/${token}`;

    const response: ApiResponse<{
      inviteId: string;
      inviteToken: string;
      inviteUrl: string;
      expiresAt: string;
      category: string | null;
    }> = {
      success: true,
      data: {
        inviteId: invite.id,
        inviteToken: invite.token,
        inviteUrl,
        expiresAt: invite.expiresAt.toISOString(),
        category: invite.category,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /providers/invite/list
 * List all pending invites (admin only)
 */
router.get(
  '/list',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const invites = await prisma.providerInvite.findMany({
      where: {
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      include: {
        provider: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: ApiResponse<typeof invites> = {
      success: true,
      data: invites,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Public Routes (no authentication required)
// ============================================

/**
 * GET /providers/invite/validate
 * Validate an invite token (public)
 */
router.get(
  '/validate',
  [query('token').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Token is required');
    }

    const { token } = req.query as { token: string };

    const invite = await prisma.providerInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      throw new ValidationError('Invalid invite token');
    }

    // For one-time use links, check if already used
    if (!invite.isReusable && invite.usedAt) {
      throw new ValidationError('This invite has already been used');
    }

    if (invite.expiresAt < new Date()) {
      throw new ValidationError('This invite has expired');
    }

    const response: ApiResponse<{
      valid: boolean;
      inviteId: string;
      email: string | null;
      expiresAt: string;
      category: string | null;
    }> = {
      success: true,
      data: {
        valid: true,
        inviteId: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        category: invite.category,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /providers/invite/:token/submit
 * Submit provider onboarding form (public)
 */
router.post(
  '/:token/submit',
  [param('token').isString().notEmpty(), ...submitOnboardingValidation],
  asyncHandler(async (req, res) => {
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

    const { token } = req.params as { token: string };
    const formData = req.body;

    // Validate invite
    const invite = await prisma.providerInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      throw new ValidationError('Invalid invite token');
    }

    // For one-time use links, check if already used
    if (!invite.isReusable && invite.usedAt) {
      throw new ValidationError('This invite has already been used');
    }

    if (invite.expiresAt < new Date()) {
      throw new ValidationError('This invite has expired');
    }

    const category = formData.category || invite.category;
    if (!isProviderCategory(category)) {
      throw new ValidationError('Category is required');
    }

    // Generate slug from provider name
    const baseSlug = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure slug uniqueness
    let slug = baseSlug;
    let slugCounter = 1;
    while (await prisma.provider.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${slugCounter}`;
      slugCounter++;
    }

    // Create provider with PENDING_APPROVAL status
    const provider = await prisma.provider.create({
      data: {
        name: formData.name,
        slug,
        category,
        description: formData.description || null,
        logoUrl: formData.logoUrl || null,
        websiteUrl: formData.websiteUrl || null,
        businessName: formData.businessName || null,
        providerType: formData.providerType || null,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        registrationNumber: formData.registrationNumber || null,
        supportedRegions: formData.supportedRegions,
        apiEndpoint: formData.apiEndpoint || null,
        webhookUrl: formData.webhookUrl || null,
        acceptsBloodTests: formData.acceptsBloodTests ?? false,
        affiliateLink: formData.affiliateLink || null,
        commissionRate: formData.commissionRate ? formData.commissionRate / 100 : null,
        subscriptionShare: formData.subscriptionShare ? formData.subscriptionShare / 100 : null,
        status: 'PENDING_APPROVAL',
      },
    });

    // Mark invite as used (only for one-time use links)
    if (!invite.isReusable) {
      await prisma.providerInvite.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          providerId: provider.id,
        },
      });
    }

    const response: ApiResponse<{
      providerId: string;
      message: string;
    }> = {
      success: true,
      data: {
        providerId: provider.id,
        message: 'Provider onboarding submitted successfully. Your application is pending review.',
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

export default router;
