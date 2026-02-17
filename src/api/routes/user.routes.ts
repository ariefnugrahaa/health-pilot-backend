import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { prisma } from '../../utils/database.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middlewares/error.middleware.js';
import { authenticate, requireOwnership } from '../middlewares/auth.middleware.js';
import { auditPhiAccess } from '../middlewares/audit.middleware.js';
import type { ApiResponse, AuthenticatedRequest } from '../../types/index.js';

const router = Router();

// ============================================
// Validation Rules
// ============================================

const updateUserValidation = [
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }),
  body('dateOfBirth').optional().isISO8601(),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
  body('phoneNumber').optional().trim().isMobilePhone('any'),
];

// ============================================
// Routes
// ============================================

/**
 * GET /users/me
 * Get current user profile
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phoneNumber: true,
        isAnonymous: true,
        isEmailVerified: true,
        status: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const response: ApiResponse<typeof user> = {
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * PATCH /users/me
 * Update current user profile
 */
router.patch(
  '/me',
  authenticate,
  updateUserValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: e.type === 'field' ? e.path : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const { firstName, lastName, dateOfBirth, gender, phoneNumber } = req.body as {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      phoneNumber?: string;
    };

    // Build update data with proper null handling for Prisma
    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) {
      updateData['firstName'] = firstName;
    }
    if (lastName !== undefined) {
      updateData['lastName'] = lastName;
    }
    if (dateOfBirth !== undefined) {
      updateData['dateOfBirth'] = new Date(dateOfBirth);
    }
    if (gender !== undefined) {
      updateData['gender'] = gender;
    }
    if (phoneNumber !== undefined) {
      updateData['phoneNumber'] = phoneNumber;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phoneNumber: true,
        isAnonymous: true,
        updatedAt: true,
      },
    });

    const response: ApiResponse<typeof user> = {
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /users/:userId
 * Get user by ID (admin or owner only)
 */
router.get(
  '/:userId',
  authenticate,
  requireOwnership('userId'),
  auditPhiAccess('user'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        isAnonymous: true,
        status: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const response: ApiResponse<typeof user> = {
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /users/me/preferences
 * Get user preferences
 */
router.get(
  '/me/preferences',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    let preferences = await prisma.userPreference.findUnique({
      where: { userId },
    });

    // Create default preferences if not exists
    if (!preferences) {
      preferences = await prisma.userPreference.create({
        data: {
          userId,
          marketingConsent: false,
          dataResearchConsent: false,
        },
      });
    }

    const response: ApiResponse<typeof preferences> = {
      success: true,
      data: preferences,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * PATCH /users/me/preferences
 * Update user preferences
 */
router.patch(
  '/me/preferences',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const {
      riskTolerance,
      budgetSensitivity,
      preferSubscription,
      deliveryPreference,
      communicationChannel,
      marketingConsent,
      dataResearchConsent,
    } = req.body as {
      riskTolerance?: string;
      budgetSensitivity?: string;
      preferSubscription?: boolean;
      deliveryPreference?: string;
      communicationChannel?: string;
      marketingConsent?: boolean;
      dataResearchConsent?: boolean;
    };

    // Build update data with proper null handling
    const updateData: Record<string, unknown> = {};
    if (riskTolerance !== undefined) {
      updateData['riskTolerance'] = riskTolerance;
    }
    if (budgetSensitivity !== undefined) {
      updateData['budgetSensitivity'] = budgetSensitivity;
    }
    if (preferSubscription !== undefined) {
      updateData['preferSubscription'] = preferSubscription;
    }
    if (deliveryPreference !== undefined) {
      updateData['deliveryPreference'] = deliveryPreference;
    }
    if (communicationChannel !== undefined) {
      updateData['communicationChannel'] = communicationChannel;
    }
    if (marketingConsent !== undefined) {
      updateData['marketingConsent'] = marketingConsent;
    }
    if (dataResearchConsent !== undefined) {
      updateData['dataResearchConsent'] = dataResearchConsent;
    }

    const preferences = await prisma.userPreference.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        riskTolerance: riskTolerance ?? null,
        budgetSensitivity: budgetSensitivity ?? null,
        preferSubscription: preferSubscription ?? null,
        deliveryPreference: deliveryPreference ?? null,
        communicationChannel: communicationChannel ?? null,
        marketingConsent: marketingConsent ?? false,
        dataResearchConsent: dataResearchConsent ?? false,
      },
    });

    const response: ApiResponse<typeof preferences> = {
      success: true,
      data: preferences,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
