import { Router } from 'express';

// Import all admin routes
import matchingRulesRoutes from './matching-rules.routes';
import treatmentsRoutes from './treatments.routes';
import providersRoutes from './providers.routes';
import attributionRoutes from './attribution.routes';
import intakeFlowsRoutes from './intake-flows.routes';
import supplementsRoutes from './supplements.routes';
import labsRoutes from './labs.routes';
import bloodTestOrdersRoutes from './blood-test-orders.routes';
import settingsRoutes from './settings.routes';
import dashboardRoutes from './dashboard.routes';

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

// Supplement Management
router.use('/supplements', supplementsRoutes);

// Lab Partner Management
router.use('/labs', labsRoutes);

// Blood Test Orders Management
router.use('/blood-test-orders', bloodTestOrdersRoutes);

// Attribution & Revenue Tracking
router.use('/attribution', attributionRoutes);

// Intake Flow Management
router.use('/intake-flows', intakeFlowsRoutes);

// Platform Settings
router.use('/settings', settingsRoutes);

// Admin Dashboard
router.use('/dashboard', dashboardRoutes);

export default router;
