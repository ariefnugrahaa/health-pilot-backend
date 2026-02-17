import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../utils/database.js';
import { analyticsService } from '../services/analytics/analytics.service.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

// ============================================
// Queue Configuration
// ============================================

const QUEUE_NAME = 'analytics-snapshots';

// Parse Redis URL to connection options
const parseRedisUrl = (url: string): { host: string; port: number; password?: string } => {
  try {
    const parsed = new URL(url);
    const result: { host: string; port: number; password?: string } = {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
    };
    if (parsed.password) {
      result.password = parsed.password;
    }
    return result;
  } catch {
    // Fallback for development
    return {
      host: 'localhost',
      port: 6379,
    };
  }
};

const redisConnection = parseRedisUrl(config.redis.url);

// ============================================
// Analytics Snapshot Queue
// ============================================

export const analyticsSnapshotQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// ============================================
// Job Data Types
// ============================================

interface SnapshotJobData {
  type: 'daily_all_providers' | 'single_provider';
  providerId?: string;
  snapshotDate: string; // ISO string
}

// ============================================
// Worker Implementation
// ============================================

export const analyticsSnapshotWorker = new Worker<SnapshotJobData>(
  QUEUE_NAME,
  async (job: Job<SnapshotJobData>) => {
    const { type, providerId, snapshotDate } = job.data;
    const date = new Date(snapshotDate);

    logger.info('Processing analytics snapshot job', {
      jobId: job.id,
      type,
      providerId,
      snapshotDate,
    });

    try {
      if (type === 'single_provider' && providerId) {
        // Generate snapshot for a single provider
        await analyticsService.generateProviderSnapshot(providerId, date);
        logger.info('Completed single provider snapshot', { providerId, date });
      } else if (type === 'daily_all_providers') {
        // Generate snapshots for all active providers
        const providers = await prisma.provider.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
        });

        logger.info(`Generating snapshots for ${providers.length} providers`);

        let successCount = 0;
        let failCount = 0;

        for (const provider of providers) {
          try {
            await analyticsService.generateProviderSnapshot(provider.id, date);
            successCount++;
          } catch (error) {
            failCount++;
            logger.error('Failed to generate snapshot for provider', {
              providerId: provider.id,
              providerName: provider.name,
              error,
            });
          }
        }

        logger.info('Completed daily provider snapshots', {
          total: providers.length,
          success: successCount,
          failed: failCount,
          date,
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Analytics snapshot job failed', {
        jobId: job.id,
        type,
        providerId,
        error,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one at a time to avoid DB overload
  }
);

// ============================================
// Event Handlers
// ============================================

analyticsSnapshotWorker.on('completed', (job) => {
  logger.info('Analytics snapshot job completed', { jobId: job.id });
});

analyticsSnapshotWorker.on('failed', (job, err) => {
  logger.error('Analytics snapshot job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

// ============================================
// Scheduler Functions
// ============================================

/**
 * Schedule daily snapshots for all providers
 * Should be called on app startup
 */
export async function scheduleDailySnapshots(): Promise<void> {
  // Remove any existing repeatable jobs first
  const existingJobs = await analyticsSnapshotQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await analyticsSnapshotQueue.removeRepeatableByKey(job.key);
  }

  // Schedule daily job at 2:00 AM UTC
  await analyticsSnapshotQueue.add(
    'daily-all-providers',
    {
      type: 'daily_all_providers',
      snapshotDate: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: '0 2 * * *', // Every day at 2:00 AM
      },
    }
  );

  logger.info('Scheduled daily analytics snapshot job');
}

/**
 * Trigger an immediate snapshot for a provider
 */
export async function triggerProviderSnapshot(providerId: string): Promise<void> {
  await analyticsSnapshotQueue.add(
    `snapshot-${providerId}`,
    {
      type: 'single_provider',
      providerId,
      snapshotDate: new Date().toISOString(),
    },
    {
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info('Triggered provider snapshot', { providerId });
}

/**
 * Shutdown the worker gracefully
 */
export async function shutdownAnalyticsWorker(): Promise<void> {
  await analyticsSnapshotWorker.close();
  await analyticsSnapshotQueue.close();
  logger.info('Analytics snapshot worker shutdown complete');
}

export default {
  queue: analyticsSnapshotQueue,
  worker: analyticsSnapshotWorker,
  scheduleDailySnapshots,
  triggerProviderSnapshot,
  shutdown: shutdownAnalyticsWorker,
};
