import { Router, Request, Response } from 'express';
import { databaseClient } from '../../utils/database.js';
import { redisClient } from '../../utils/redis.js';
import type { ApiResponse } from '../../types/index.js';

const router = Router();

// ============================================
// Health Check Endpoints
// ============================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
  };
}

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
}

/**
 * GET /health
 * Basic health check
 */
router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: { status: 'ok' },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe - checks all dependencies
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  // Check database
  const dbStart = Date.now();
  const dbHealthy = await databaseClient.healthCheck();
  const dbLatency = Date.now() - dbStart;

  // Check Redis
  const redisStart = Date.now();
  const redisHealthy = await redisClient.healthCheck();
  const redisLatency = Date.now() - redisStart;

  const allHealthy = dbHealthy && redisHealthy;

  const healthStatus: HealthStatus = {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
    uptime: process.uptime(),
    services: {
      database: {
        status: dbHealthy ? 'up' : 'down',
        latency: dbLatency,
      },
      redis: {
        status: redisHealthy ? 'up' : 'down',
        latency: redisLatency,
      },
    },
  };

  const response: ApiResponse<HealthStatus> = {
    success: allHealthy,
    data: healthStatus,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  const statusCode = allHealthy ? 200 : 503;
  const totalLatency = Date.now() - startTime;

  res.set('X-Health-Check-Latency', `${totalLatency}ms`);
  res.status(statusCode).json(response);
});

/**
 * GET /health/detailed
 * Detailed health information (protected in production)
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();

  const details = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
    nodeVersion: process.version,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB',
    },
    environment: process.env['NODE_ENV'],
  };

  const response: ApiResponse<typeof details> = {
    success: true,
    data: details,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
});

export default router;
