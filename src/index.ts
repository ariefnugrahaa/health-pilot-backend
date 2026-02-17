import { createApp } from './app.js';
import { config } from './config/index.js';
import logger from './utils/logger.js';
import { databaseClient } from './utils/database.js';
import { redisClient } from './utils/redis.js';
import { queueManager } from './jobs/queue.js';
import { initWorkers } from './jobs/workers.js';

// ============================================
// Server Startup
// ============================================

async function startServer(): Promise<void> {
  try {
    // Connect to database
    logger.info('Connecting to database...');
    await databaseClient.connect();

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redisClient.connect();

    // Initialize background workers
    initWorkers();

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.app.port, () => {
      logger.info(`🚀 HealthPilot API server started`, {
        port: config.app.port,
        environment: config.app.env,
        apiVersion: config.app.apiVersion,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close job queues
          await queueManager.closeAll();
          logger.info('Job queues closed');

          // Disconnect from Redis
          await redisClient.disconnect();
          logger.info('Redis disconnected');

          // Disconnect from database
          await databaseClient.disconnect();
          logger.info('Database disconnected');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection', { reason });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
startServer();
