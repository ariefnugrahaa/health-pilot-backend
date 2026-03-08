import { Router } from 'express';

// Import all admin routes
import matchingRulesRoutes from './matching-rules.routes';
import treatmentsRoutes from './treatments.routes';
import providersRoutes from './providers.routes';
import attributionRoutes from './attribution.routes';
import intakeFlowsRoutes from './intake-flows.routes';

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

// Intake Flow Management
router.use('/intake-flows', intakeFlowsRoutes);

export default router;
