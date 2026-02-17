import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// ============================================
// Environment Schema Validation
// ============================================
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),
  ENCRYPTION_ALGORITHM: z.string().default('aes-256-gcm'),

  // AI Provider Selection
  AI_PROVIDER: z.enum(['glm', 'anthropic', 'mock']).default('anthropic'),

  // Anthropic Claude AI
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_MAX_TOKENS: z.string().transform(Number).default('4096'),

  // GLM (ChatGLM/Zhipu AI)
  GLM_API_KEY: z.string().optional(),
  GLM_MODEL: z.string().default('glm-4-flash'),
  GLM_API_URL: z.string().default('https://open.bigmodel.cn/api/paas/v4/chat/completions'),
  GLM_MAX_TOKENS: z.string().transform(Number).default('4096'),
  GLM_TIMEOUT: z.string().transform(Number).default('30000'),

  // Cloudflare
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_FORMAT: z.string().default('combined'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  CORS_CREDENTIALS: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
});

// ============================================
// Parse and Validate Environment
// ============================================
const parseEnv = (): z.infer<typeof envSchema> => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
};

const env = parseEnv();

// ============================================
// Configuration Object
// ============================================
export const config = {
  // Application
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
    apiVersion: env.API_VERSION,
    frontendUrl: env.FRONTEND_URL,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  },

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
  },

  // JWT Authentication
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  // Encryption (PHI Data)
  encryption: {
    key: env.ENCRYPTION_KEY,
    algorithm: env.ENCRYPTION_ALGORITHM,
  },

  // AI Provider Configuration
  ai: {
    provider: env.AI_PROVIDER,
  },

  // Anthropic Claude AI
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    maxTokens: env.ANTHROPIC_MAX_TOKENS,
  },

  // GLM (ChatGLM/Zhipu AI)
  glm: {
    apiKey: env.GLM_API_KEY,
    model: env.GLM_MODEL,
    apiUrl: env.GLM_API_URL,
    maxTokens: env.GLM_MAX_TOKENS,
    timeout: env.GLM_TIMEOUT,
  },

  // Cloudflare
  cloudflare: {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    zoneId: env.CLOUDFLARE_ZONE_ID,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },

  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  },
} as const;

export type Config = typeof config;
export default config;
