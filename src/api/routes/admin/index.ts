import { Router } from 'express';

// Import all admin routes
import matchingRulesRoutes from './matching-rules.routes.js';
import treatmentsRoutes from './treatments.routes.js';
import providersRoutes from './providers.routes.js';
import attributionRoutes from './attribution.routes.js';

const router = Router();

// ============================================
// Admin API Routes
// ============================================

// Matching Rules Management
router.use('/matching-rules', matchingRulesRoutes);

// Treatment Management
router.use('/treatments', treatmentsRoutes);

// Provider Management
router.use('/providers', providersRoutes);

// Attribution & Revenue Tracking
router.use('/attribution', attributionRoutes);

export default router;
