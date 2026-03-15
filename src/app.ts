import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config/index.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './api/middlewares/error.middleware.js';
import { requestId } from './api/middlewares/audit.middleware.js';

// Import routes
import healthRoutes from './api/routes/health.routes.js';
import authRoutes from './api/routes/auth.routes.js';
import userRoutes from './api/routes/user.routes.js';
import intakeRoutes from './api/routes/intake.routes.js';
import recommendationRoutes from './api/routes/recommendation.routes.js';
import providerRoutes from './api/routes/provider.routes.js';
import bloodTestRoutes from './api/routes/bloodtest.routes.js';
import handoffRoutes from './api/routes/handoff.routes.js';
import diagnosticRoutes from './api/routes/diagnostic.routes.js';
import dashboardRoutes from './api/routes/dashboard.routes.js';
import labPartnerRoutes from './api/routes/lab-partner.routes.js';
import adminRoutes from './api/routes/admin/index.js';
import analyticsRoutes from './api/routes/analytics.routes.js';
import supplementRoutes from './api/routes/supplement.routes.js';
import providerRatingsRoutes from './api/routes/provider-ratings.routes.js';
import treatmentFeedbackRoutes from './api/routes/treatment-feedback.routes.js';
import treatmentRoutes from './api/routes/treatment.routes.js';
import providerInviteRoutes from './api/routes/provider-invite.routes.js';
import settingsRoutes from './api/routes/settings.routes.js';

// ============================================
// Express Application Factory
// ============================================

export function createApp(): Application {
  const app = express();

  // ============================================
  // Security Middleware
  // ============================================

  // Helmet - Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.cors.origin.includes(',')
        ? config.cors.origin.split(',').map((o) => o.trim())
        : config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // ============================================
  // Body Parsing & Compression
  // ============================================

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(compression());

  // ============================================
  // Logging
  // ============================================

  // Request ID
  app.use(requestId);

  // HTTP request logging
  if (config.app.isDevelopment) {
    app.use(morgan('dev'));
  } else {
    app.use(
      morgan('combined', {
        stream: {
          write: (message: string) => logger.http(message.trim()),
        },
      })
    );
  }

  // ============================================
  // API Routes
  // ============================================

  const apiPrefix = `/api/${config.app.apiVersion}`;

  // Health check (no prefix)
  app.use('/health', healthRoutes);

  // API routes
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/users`, userRoutes);
  app.use(`${apiPrefix}/dashboard`, dashboardRoutes);
  app.use(`${apiPrefix}/intakes`, intakeRoutes);
  app.use(`${apiPrefix}/recommendations`, recommendationRoutes);
  app.use(`${apiPrefix}/providers`, providerRoutes);
  app.use(`${apiPrefix}/blood-tests`, bloodTestRoutes);
  app.use(`${apiPrefix}/lab-partners`, labPartnerRoutes);
  app.use(`${apiPrefix}/handoffs`, handoffRoutes);
  app.use(`${apiPrefix}/diagnostics`, diagnosticRoutes);

  // Admin routes
  app.use(`${apiPrefix}/admin`, adminRoutes);

  // Analytics routes (provider benchmarking)
  app.use(`${apiPrefix}/analytics`, analyticsRoutes);

  // Supplement routes (non-provider treatments)
  app.use(`${apiPrefix}/supplements`, supplementRoutes);

  // Provider ratings routes
  app.use(`${apiPrefix}/providers`, providerRatingsRoutes);

  // Treatment feedback routes
  app.use(`${apiPrefix}/treatments`, treatmentFeedbackRoutes);

  // Treatment routes
  app.use(`${apiPrefix}/treatments`, treatmentRoutes);

  // Provider invite routes (public onboarding)
  app.use(`${apiPrefix}/providers/invite`, providerInviteRoutes);
  app.use(`${apiPrefix}/settings`, settingsRoutes);

  // ============================================
  // Error Handling
  // ============================================

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
