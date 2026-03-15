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

  // OpenAI (supports both OPENAI_API_KEY and OPEN_AI_API_KEY)
  OPENAI_API_KEY: z.string().optional(),
  OPEN_AI_API_KEY: z.string().optional(), // Alternative naming
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),
  OPENAI_MAX_TOKENS: z.string().transform(Number).default('4096'),
  OPENAI_TIMEOUT: z.string().transform(Number).default('60000'),

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

  // OpenAI
  openai: {
    apiKey: env.OPENAI_API_KEY || env.OPEN_AI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
    maxTokens: env.OPENAI_MAX_TOKENS,
    timeout: env.OPENAI_TIMEOUT,
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
