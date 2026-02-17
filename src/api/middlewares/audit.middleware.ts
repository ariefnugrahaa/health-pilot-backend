import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import type { AuthenticatedRequest, AuditAction } from '../../types/index.js';
import type { Prisma } from '@prisma/client';
/// <reference types="node" />

// ============================================
// Audit Logger Interface (SOLID - ISP)
// ============================================
export interface IAuditLogger {
  log(entry: AuditLogInput): Promise<void>;
}

export interface AuditLogInput {
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Audit Logger Implementation
// ============================================
class AuditLogger implements IAuditLogger {
  /**
   * Log an audit entry
   */
  async log(entry: AuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          ...(entry.metadata && { metadata: entry.metadata as Prisma.InputJsonValue }),
        },
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      logger.error('Failed to create audit log', { error, entry });
    }
  }
}

export const auditLogger = new AuditLogger();

// ============================================
// Request ID Middleware
// ============================================

/**
 * Add unique request ID to each request
 */
export function requestId(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  next();
}

// ============================================
// Audit Middleware Factory
// ============================================

/**
 * Create audit middleware for specific actions
 */
export function auditAction(action: AuditAction, resourceType: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Store original end function
    const originalEnd = res.end;

    // Override end to capture response
    res.end = function (
      this: Response,
      chunk?: string | Buffer | (() => void),

      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void
    ): Response {
      // Log audit after response
      const resourceId = (req.params as Record<string, string | undefined>)['id'] ?? undefined;

      const logEntry: AuditLogInput = {
        action,
        resourceType,
        metadata: {
          method: (req as { method?: string }).method,
          path: (req as { path?: string }).path,
          statusCode: res.statusCode,
          requestId: req.requestId,
        },
      };

      if (req.user?.userId) {
        logEntry.userId = req.user.userId;
      }
      if (resourceId) {
        logEntry.resourceId = resourceId;
      }
      const clientIp = getClientIp(req);
      if (clientIp) {
        logEntry.ipAddress = clientIp;
      }
      const userAgent = (req.headers as Record<string, string | undefined>)['user-agent'];
      if (userAgent) {
        logEntry.userAgent = userAgent;
      }

      auditLogger.log(logEntry);

      // Call original end - use simpler approach
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalEnd as any).call(this, chunk, encodingOrCallback, callback);
    };

    next();
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get client IP address from request
 */
function getClientIp(req: AuthenticatedRequest): string | undefined {
  const headers = req.headers as Record<string, string | string[] | undefined>;

  // Check for forwarded headers (behind proxy/load balancer)
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ips?.trim();
  }

  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to socket address
  return (req as { ip?: string }).ip;
}

// ============================================
// PHI Access Audit
// ============================================

/**
 * Audit PHI (Protected Health Information) access
 * Required for HIPAA compliance
 */
export function auditPhiAccess(resourceType: string): ReturnType<typeof auditAction> {
  return auditAction('READ', resourceType);
}

/**
 * Audit PHI modification
 */
export function auditPhiModification(
  resourceType: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE'
): ReturnType<typeof auditAction> {
  return auditAction(action, resourceType);
}
