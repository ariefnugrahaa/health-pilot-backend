/**
 * Settings Routes
 * Handles platform settings management for admin dashboard
 */

import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware';
import { LandingPageSettings, normalizeLandingPageSettings } from '../landing-settings.utils';

const prisma = new PrismaClient();
const router = Router();

// All settings routes require admin authentication
router.use(authenticate, requireAdmin);

interface SystemSettings {
  matchingRulesEnabled: boolean;
  bloodTestAllowUpload: boolean;
  bloodTestAllowOrder: boolean;
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  matchingRulesEnabled: true,
  bloodTestAllowUpload: true,
  bloodTestAllowOrder: true,
};

function normalizeSystemSettings(value: unknown): SystemSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    matchingRulesEnabled:
      typeof raw.matchingRulesEnabled === 'boolean'
        ? raw.matchingRulesEnabled
        : DEFAULT_SYSTEM_SETTINGS.matchingRulesEnabled,
    bloodTestAllowUpload:
      typeof raw.bloodTestAllowUpload === 'boolean'
        ? raw.bloodTestAllowUpload
        : DEFAULT_SYSTEM_SETTINGS.bloodTestAllowUpload,
    bloodTestAllowOrder:
      typeof raw.bloodTestAllowOrder === 'boolean'
        ? raw.bloodTestAllowOrder
        : DEFAULT_SYSTEM_SETTINGS.bloodTestAllowOrder,
  };
}

// ============================================
// GET /settings - Get all settings
// ============================================

router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.platformSetting.findMany();
    const settingsMap: Record<string, unknown> = {};

    settings.forEach((setting) => {
      settingsMap[setting.key] = setting.value;
    });

    res.json({
      success: true,
      data: settingsMap,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch settings' },
    });
  }
});

// ============================================
// GET /settings/landing - Get landing page settings
// ============================================

router.get('/landing', async (_req: Request, res: Response) => {
  try {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'landing_page' },
    });

    res.json({
      success: true,
      data: normalizeLandingPageSettings(setting?.value),
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error fetching landing page settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch landing page settings' },
    });
  }
});

// ============================================
// GET /settings/system - Get system settings
// ============================================

router.get('/system', async (_req: Request, res: Response) => {
  try {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'system' },
    });

    res.json({
      success: true,
      data: normalizeSystemSettings(setting?.value),
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch system settings' },
    });
  }
});

// ============================================
// GET /settings/:key - Get specific setting
// ============================================

router.get('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    if (typeof key !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid settings key' },
      });
      return;
    }

    const setting = await prisma.platformSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Setting not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: { key: setting.key, value: setting.value },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch setting' },
    });
  }
});

// ============================================
// PUT /settings/landing - Update landing page settings
// ============================================

router.put('/landing', async (req: Request, res: Response) => {
  try {
    const settings: LandingPageSettings = normalizeLandingPageSettings(req.body);

    const setting = await prisma.platformSetting.upsert({
      where: { key: 'landing_page' },
      update: {
        value: settings as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      create: {
        key: 'landing_page',
        value: settings as unknown as Prisma.InputJsonValue,
        description: 'Landing page content and configuration',
      },
    });

    res.json({
      success: true,
      data: normalizeLandingPageSettings(setting.value),
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error updating landing page settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update landing page settings' },
    });
  }
});

// ============================================
// PUT /settings/system - Update system settings
// ============================================

router.put('/system', async (req: Request, res: Response) => {
  try {
    const settings: SystemSettings = req.body;

    const setting = await prisma.platformSetting.upsert({
      where: { key: 'system' },
      update: {
        value: settings as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      create: {
        key: 'system',
        value: settings as unknown as Prisma.InputJsonValue,
        description: 'System configuration and feature flags',
      },
    });

    res.json({
      success: true,
      data: setting.value,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update system settings' },
    });
  }
});

// ============================================
// PUT /settings/:key - Update any setting by key
// ============================================

router.put('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    if (typeof key !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid settings key' },
      });
      return;
    }

    const { value, description } = req.body;

    if (value === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Value is required' },
      });
      return;
    }

    const setting = await prisma.platformSetting.upsert({
      where: { key },
      update: {
        value,
        description,
        updatedAt: new Date(),
      },
      create: {
        key,
        value,
        description,
      },
    });

    res.json({
      success: true,
      data: setting.value,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update setting' },
    });
  }
});

export default router;
