import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

// BullMQ requires maxRetriesPerRequest: null for blocking operations
const createBullMQConnection = (): Redis => {
  return new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
};

// ============================================
// Queue Names
// ============================================
export const QUEUE_NAMES = {
  AI_ANALYSIS: 'ai-analysis',
  BLOOD_TEST_PROCESSING: 'blood-test-processing',
  PROVIDER_HANDOFF: 'provider-handoff',
  EMAIL_NOTIFICATION: 'email-notification',
  AUDIT_LOG: 'audit-log',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================
// Job Data Types
// ============================================
export interface AIAnalysisJobData {
  userId: string;
  healthIntakeId: string;
  bloodTestId?: string;
}

export interface BloodTestProcessingJobData {
  bloodTestId: string;
  labPartnerId: string;
  externalOrderId: string;
}

export interface ProviderHandoffJobData {
  handoffId: string;
  providerId: string;
  userId: string;
}

export interface EmailNotificationJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export interface AuditLogJobData {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Queue Manager Interface (SOLID - ISP)
// ============================================
export interface IQueueManager {
  addJob<T>(queueName: QueueName, data: T, options?: JobOptions): Promise<Job<T>>;
  getQueue(queueName: QueueName): Queue;
  closeAll(): Promise<void>;
}

export interface JobOptions {
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  priority?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

// ============================================
// Queue Manager Implementation
// ============================================
class QueueManager implements IQueueManager {
  private static instance: QueueManager;
  private queues: Map<QueueName, Queue> = new Map();
  private workers: Map<QueueName, Worker> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();

  private readonly defaultJobOptions: JobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  };

  private constructor() {
    // Initialize queues
    this.initializeQueues();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Initialize all queues
   */
  private initializeQueues(): void {
    for (const queueName of Object.values(QUEUE_NAMES)) {
      // Create queue with dedicated connection
      const queue = new Queue(queueName, { connection: createBullMQConnection() });
      this.queues.set(queueName, queue);

      // Create queue events for monitoring with dedicated connection
      const events = new QueueEvents(queueName, { connection: createBullMQConnection() });
      this.queueEvents.set(queueName, events);

      // Setup event listeners
      events.on('completed', ({ jobId }) => {
        logger.debug(`Job ${jobId} completed in queue ${queueName}`);
      });

      events.on('failed', ({ jobId, failedReason }) => {
        logger.error(`Job ${jobId} failed in queue ${queueName}`, { reason: failedReason });
      });
    }

    logger.info('✅ Job queues initialized');
  }

  /**
   * Add a job to a queue
   */
  public async addJob<T>(queueName: QueueName, data: T, options?: JobOptions): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobOptions = { ...this.defaultJobOptions, ...options };

    const job = await queue.add(queueName, data, jobOptions);
    logger.debug(`Job ${job.id} added to queue ${queueName}`);

    return job as Job<T>;
  }

  /**
   * Get a queue by name
   */
  public getQueue(queueName: QueueName): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    return queue;
  }

  /**
   * Register a worker for a queue
   */
  public registerWorker<T>(
    queueName: QueueName,
    processor: (job: Job<T>) => Promise<void>
  ): Worker<T> {
    const worker = new Worker<T>(queueName, processor, {
      connection: createBullMQConnection(),
      concurrency: 5,
    });

    worker.on('completed', (job: Job<T>) => {
      logger.info(`Job ${job.id} completed successfully`, { queue: queueName });
    });

    worker.on('failed', (job: Job<T> | undefined, error: Error) => {
      logger.error(`Job ${job?.id} failed`, { queue: queueName, error: error.message });
    });

    this.workers.set(queueName, worker as Worker);
    logger.info(`Worker registered for queue ${queueName}`);

    return worker;
  }

  /**
   * Close all queues and workers
   */
  public async closeAll(): Promise<void> {
    // Close workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.debug(`Worker for ${name} closed`);
    }

    // Close queue events
    for (const [name, events] of this.queueEvents) {
      await events.close();
      logger.debug(`Queue events for ${name} closed`);
    }

    // Close queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.debug(`Queue ${name} closed`);
    }

    logger.info('All queues closed');
  }
}

// ============================================
// Export
// ============================================
export const queueManager = QueueManager.getInstance();
export default queueManager;
