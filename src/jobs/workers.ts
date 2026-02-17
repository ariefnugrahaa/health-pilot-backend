import { Job } from 'bullmq';
import { queueManager, QUEUE_NAMES, EmailNotificationJobData, AIAnalysisJobData } from './queue.js';
import logger from '../utils/logger.js';
import { emailService } from '../services/notification/email.service.js';
// import { recommendationService } from '../services/recommendation/recommendation.service.js'; // Circular dependency risk?
// Ideally services should be injected or imported carefully.

// ============================================
// Worker Processors
// ============================================

/**
 * Process Email Notifications
 */
const processEmailJob = async (job: Job<EmailNotificationJobData>): Promise<void> => {
  const { to, subject, template, data } = job.data;
  try {
    await emailService.sendEmail(to, subject, template, data);
  } catch (error) {
    logger.error('Failed to process email job', { jobId: job.id, error });
    throw error; // Retry
  }
};

/**
 * Process AI Analysis (Async Version)
 * If we move the synchronous call from the route to here.
 */
const processAIAnalysisJob = async (job: Job<AIAnalysisJobData>): Promise<void> => {
  // This would call recommendationService.generateRecommendation...
  // But currently we do it synchronously in the API for immediate feedback.
  // We keep this placeholder for future scaling.
  logger.info('Processing AI analysis job (async placeholder)', { jobId: job.id, ...job.data });
  await new Promise((resolve) => setTimeout(resolve, 1000));
};

// ============================================
// Worker Initialization
// ============================================

export const initWorkers = (): void => {
  logger.info('Initializing background workers...');

  // Email Worker
  queueManager.registerWorker<EmailNotificationJobData>(
    QUEUE_NAMES.EMAIL_NOTIFICATION,
    processEmailJob
  );

  // AI Analysis Worker
  queueManager.registerWorker<AIAnalysisJobData>(QUEUE_NAMES.AI_ANALYSIS, processAIAnalysisJob);

  // Provider Handoff Worker (Placeholder)
  queueManager.registerWorker(QUEUE_NAMES.PROVIDER_HANDOFF, async (job) => {
    logger.info('Processing provider handoff job', { jobId: job.id });
  });

  // Audit Log Worker (Placeholder for async audit)
  queueManager.registerWorker(QUEUE_NAMES.AUDIT_LOG, async (job) => {
    logger.info('Processing audit log job', { jobId: job.id });
    // In real app: await auditService.log(job.data);
  });
};
