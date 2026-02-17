import Redis from 'ioredis';
import { config } from '../config/index.js';
import logger from './logger.js';

// ============================================
// Redis Client Interface (SOLID - DIP)
// ============================================
export interface IRedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ============================================
// Redis Client Implementation
// ============================================
class RedisClient implements IRedisClient {
  private static instance: RedisClient;
  private client: Redis;
  private connected = false;

  private constructor() {
    this.client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number): number | null => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    // Event handlers
    this.client.on('connect', () => {
      this.connected = true;
      logger.info('✅ Redis connected successfully');
    });

    this.client.on('error', (error: Error) => {
      logger.error('Redis error', { error: error.message });
    });

    this.client.on('close', () => {
      this.connected = false;
      logger.warn('Redis connection closed');
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  /**
   * Get raw Redis client
   */
  public getClient(): Redis {
    return this.client;
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
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
   * Get value by key
   */
  public async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set value with optional TTL
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Delete key
   */
  public async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  public async mget(keys: string[]): Promise<(string | null)[]> {
    return this.client.mget(keys);
  }

  /**
   * Set multiple key-value pairs
   */
  public async mset(pairs: Record<string, string>): Promise<void> {
    const args: string[] = [];
    for (const [key, value] of Object.entries(pairs)) {
      args.push(key, value);
    }
    await this.client.mset(...args);
  }

  /**
   * Increment value
   */
  public async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Set expiration
   */
  public async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }
}

// ============================================
// Export
// ============================================
export const redisClient = RedisClient.getInstance();
export const redis = redisClient.getClient();
export default redisClient;
