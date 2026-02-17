// ============================================
// Jest Test Setup
// ============================================

import { jest, afterAll } from '@jest/globals';

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3001';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/healthpilot_test';
process.env['REDIS_URL'] = 'redis://:test@localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-minimum-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars!!12';
process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
process.env['ANTHROPIC_MODEL'] = 'claude-sonnet-4-20250514';
process.env['ANTHROPIC_MAX_TOKENS'] = '4096';

// Mock external services
jest.mock('../utils/database.js', () => ({
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    healthIntake: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recommendation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    provider: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    treatment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    userPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
  databaseClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn<() => boolean>().mockReturnValue(true),
    healthCheck: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  },
}));

jest.mock('../utils/redis.js', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ping: jest.fn<() => Promise<string>>().mockResolvedValue('PONG'),
  },
  redisClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn<() => boolean>().mockReturnValue(true),
    healthCheck: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  },
}));

jest.mock('../jobs/queue.js', () => ({
  queueManager: {
    addJob: jest.fn(),
    getQueue: jest.fn(),
    closeAll: jest.fn(),
  },
  QUEUE_NAMES: {
    AI_ANALYSIS: 'ai-analysis',
    BLOOD_TEST_PROCESSING: 'blood-test-processing',
    PROVIDER_HANDOFF: 'provider-handoff',
    EMAIL_NOTIFICATION: 'email-notification',
    AUDIT_LOG: 'audit-log',
  },
}));

// Global test utilities
global.testUtils = {
  generateTestUser: (): Record<string, unknown> => ({
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    isAnonymous: false,
    status: 'ACTIVE',
    role: 'USER',
  }),

  generateTestToken: (): string => 'test-jwt-token',

  generateTestIntake: (): Record<string, unknown> => ({
    id: 'test-intake-id',
    userId: 'test-user-id',
    status: 'COMPLETED',
    intakeDataEncrypted: 'encrypted-data',
    primaryGoals: ['weight_management'],
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
};

// Extend Jest matchers
declare global {
  var testUtils: {
    generateTestUser: () => Record<string, unknown>;
    generateTestToken: () => string;
    generateTestIntake: () => Record<string, unknown>;
  };
}

// Cleanup after all tests
afterAll(async () => {
  // Clean up any resources
  jest.clearAllMocks();
});
