import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { AuthenticationError, AuthorizationError } from './error.middleware.js';
import type { AuthenticatedRequest, JwtPayload, UserRole } from '../../types/index.js';

// ============================================
// JWT Authentication Middleware
// ============================================

/**
 * Verify JWT token and attach user to request
 */
export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('No authorization header provided');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthenticationError('Invalid authorization header format');
    }

    const token = parts[1];
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    // Silently continue without user
    next();
  }
}

// ============================================
// Role-Based Authorization Middleware
// ============================================

/**
 * Require specific roles
 */
export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const userRole = req.user.role as UserRole;
    if (!roles.includes(userRole)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Require admin role
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  return requireRoles('ADMIN', 'SUPER_ADMIN')(req, res, next);
}

/**
 * Require super admin role
 */
export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  return requireRoles('SUPER_ADMIN')(req, res, next);
}

/**
 * Require provider admin role
 */
export function requireProviderAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  return requireRoles('PROVIDER_ADMIN', 'ADMIN', 'SUPER_ADMIN')(req, res, next);
}

// ============================================
// Resource Ownership Middleware
// ============================================

/**
 * Verify user owns the resource or is admin
 */
export function requireOwnership(userIdParam: string = 'userId') {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const resourceUserId = req.params[userIdParam];
    const isOwner = req.user.userId === resourceUserId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return next(new AuthorizationError('Access denied to this resource'));
    }

    next();
  };
}
