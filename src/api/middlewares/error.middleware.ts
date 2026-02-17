import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import type { ApiResponse, ApiError } from '../../types/index.js';

// ============================================
// Custom Error Classes
// ============================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    if (details) {
      this.details = details;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Array<{ field: string; message: string }>) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR', true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT', true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

// ============================================
// Error Handler Middleware
// ============================================

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
  } else {
    logger.error('Unexpected error', {
      message: err.message,
      stack: err.stack,
    });
  }

  // Determine response
  let statusCode = 500;
  let errorResponse: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorResponse = {
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    };
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorResponse = {
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
    };
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorResponse = {
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired',
    };
  }

  const response: ApiResponse = {
    success: false,
    error: errorResponse,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(response);
}

// ============================================
// Not Found Handler
// ============================================

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(404).json(response);
}

// ============================================
// Async Handler Wrapper
// ============================================

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
