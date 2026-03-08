/**
 * Public Settings Routes
 * Read-only settings endpoints for the public app
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { normalizeLandingPageSettings } from './landing-settings.utils';

const prisma = new PrismaClient();
const router = Router();

// ============================================
// GET /settings/landing - Public landing content
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
    console.error('Error fetching public landing settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch landing settings' },
    });
  }
});

export default router;
