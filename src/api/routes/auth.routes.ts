import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
// import { v4 as uuidv4 } from 'uuid';

import { config } from '../../config/index.js';
import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import {
  asyncHandler,
  ValidationError,
  AuthenticationError,
} from '../middlewares/error.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import type {
  ApiResponse,
  TokenPair,
  JwtPayload,
  AuthenticatedRequest,
} from '../../types/index.js';

const router = Router();

// ============================================
// Validation Rules
// ============================================

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ============================================
// Helper Functions
// ============================================

function generateTokens(payload: JwtPayload): TokenPair {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signOptions: SignOptions = { expiresIn: config.jwt.expiresIn as unknown as any };
  const accessToken = jwt.sign(payload, config.jwt.secret, signOptions);

  const refreshSignOptions: SignOptions = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expiresIn: config.jwt.refreshExpiresIn as unknown as any,
  };
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.secret,
    refreshSignOptions
  );

  // Parse expiresIn to seconds
  const expiresIn = parseExpiresIn(config.jwt.expiresIn);

  return { accessToken, refreshToken, expiresIn };
}

function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 3600; // Default 1 hour
  }

  const value = parseInt(match[1] ?? '1', 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 3600;
  }
}

// ============================================
// Routes
// ============================================

/**
 * POST /auth/register
 * Register a new user
 */
router.post(
  '/register',
  registerValidation,
  asyncHandler(async (req: Request, res: Response) => {
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

    const { email, password, firstName, lastName } = req.body as {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    };

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        isAnonymous: false,
        isEmailVerified: false,
        status: 'ACTIVE',
        role: 'USER',
      },
    });

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      ...(user.email && { email: user.email }),
      role: user.role,
      isAnonymous: user.isAnonymous,
    };

    const tokens = generateTokens(payload);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + parseExpiresIn(config.jwt.refreshExpiresIn) * 1000),
      },
    });

    logger.info('User registered', { userId: user.id });

    const response: ApiResponse<{ user: { id: string; email: string }; tokens: TokenPair }> = {
      success: true,
      data: {
        user: { id: user.id, email: user.email ?? '' },
        tokens,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * POST /auth/login
 * Login with email and password
 */
router.post(
  '/login',
  loginValidation,
  asyncHandler(async (req: Request, res: Response) => {
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

    const { email, password } = req.body as { email: string; password: string };

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      throw new AuthenticationError('Account is not active');
    }

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      ...(user.email && { email: user.email }),
      role: user.role,
      isAnonymous: user.isAnonymous,
    };

    const tokens = generateTokens(payload);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + parseExpiresIn(config.jwt.refreshExpiresIn) * 1000),
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info('User logged in', { userId: user.id });

    const response: ApiResponse<{ user: { id: string; email: string }; tokens: TokenPair }> = {
      success: true,
      data: {
        user: { id: user.id, email: user.email ?? '' },
        tokens,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /auth/anonymous
 * Create anonymous session
 */
router.post(
  '/anonymous',
  asyncHandler(async (_req: Request, res: Response) => {
    // Create anonymous user
    const user = await prisma.user.create({
      data: {
        isAnonymous: true,
        status: 'ACTIVE',
        role: 'USER',
      },
    });

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      role: user.role,
      isAnonymous: true,
    };

    const tokens = generateTokens(payload);

    logger.info('Anonymous user created', { userId: user.id });

    const response: ApiResponse<{ userId: string; tokens: TokenPair }> = {
      success: true,
      data: {
        userId: user.id,
        tokens,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken: string };

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    // Verify token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.secret) as JwtPayload;
    } catch {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check if token exists and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.isRevoked) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token expired');
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate new tokens
    const payload: JwtPayload = {
      userId: decoded.userId,
      ...(decoded.email && { email: decoded.email }),
      role: decoded.role,
      isAnonymous: decoded.isAnonymous,
    };

    const tokens = generateTokens(payload);

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        userId: decoded.userId,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + parseExpiresIn(config.jwt.refreshExpiresIn) * 1000),
      },
    });

    const response: ApiResponse<TokenPair> = {
      success: true,
      data: tokens,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /auth/logout
 * Logout and revoke tokens
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;

    if (userId) {
      // Revoke all refresh tokens for user
      await prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });

      logger.info('User logged out', { userId });
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Logged out successfully' },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /auth/link-anonymous-intake
 * Link an anonymous intake to an authenticated user
 * This endpoint allows users to save their anonymous intake data after logging in
 */
router.post(
  '/link-anonymous-intake',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { anonymousIntakeId, anonymousUserId } = req.body as {
      anonymousIntakeId?: string;
      anonymousUserId?: string;
    };
    const userId = req.user?.userId;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    if (!anonymousIntakeId) {
      throw new ValidationError('anonymousIntakeId is required');
    }

    // Verify the anonymous intake exists
    const anonymousIntake = await prisma.healthIntake.findUnique({
      where: { id: anonymousIntakeId },
      include: { user: true },
    });

    if (!anonymousIntake) {
      throw new NotFoundError('Anonymous intake');
    }

    // Check if the intake is from an anonymous user
    if (!anonymousIntake.user.isAnonymous) {
      throw new ValidationError('Intake is not from an anonymous user');
    }

    // Verify the anonymous user ID if provided (for security)
    if (anonymousUserId && anonymousIntake.userId !== anonymousUserId) {
      throw new ValidationError('Anonymous user ID does not match');
    }

    // Update the intake to associate it with the authenticated user
    const updatedIntake = await prisma.healthIntake.update({
      where: { id: anonymousIntakeId },
      data: {
        userId,
      },
    });

    // If the anonymous user has no other intakes or recommendations, delete the anonymous user
    const anonymousUserIntakesCount = await prisma.healthIntake.count({
      where: { userId: anonymousIntake.userId },
    });

    if (anonymousUserIntakesCount === 0) {
      await prisma.user.delete({
        where: { id: anonymousIntake.userId },
      });
      logger.info('Anonymous user deleted', { userId: anonymousIntake.userId });
    }

    logger.info('Anonymous intake linked to authenticated user', {
      anonymousIntakeId,
      authenticatedUserId: userId,
    });

    const response: ApiResponse<{ intakeId: string; message: string }> = {
      success: true,
      data: {
        intakeId: updatedIntake.id,
        message: 'Intake successfully linked to your account',
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
