import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import logger from './logger.js';

// ============================================
// Database Client Interface (SOLID - DIP)
// ============================================
export interface IDatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

// ============================================
// Prisma Client Singleton
// ============================================
class DatabaseClient implements IDatabaseClient {
  private static instance: DatabaseClient;
  private prisma: PrismaClient;
  private connected = false;

  private constructor() {
    this.prisma = new PrismaClient({
      log: config.app.isDevelopment
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
    });

    // Log queries in development
    if (config.app.isDevelopment) {
      this.prisma.$on('query' as never, (e: { query: string; duration: number }) => {
        logger.debug(`Query: ${e.query}`, { duration: `${e.duration}ms` });
      });
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  /**
   * Get Prisma client
   */
  public getClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Connect to database
   */
  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.connected = true;
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed', { error });
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.connected = false;
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database', { error });
      throw error;
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================
// Export
// ============================================
export const databaseClient = DatabaseClient.getInstance();
export const prisma = databaseClient.getClient();
export default prisma;
