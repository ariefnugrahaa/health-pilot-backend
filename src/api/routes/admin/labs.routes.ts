import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { asyncHandler, ValidationError } from '../../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../../types/index.js';

const router = Router();

// ============================================
// Types
// ============================================

interface OperatingDay {
  day: string;
  capacity: number;
  timeSlots: { start: string; end: string }[];
}

interface CreateLabPayload {
  name: string;
  city: string;
  state: string;
  address?: string;
  serviceTypes?: string[];
  resultTimeDays?: number;
  isActive?: boolean;
  operatingDays?: OperatingDay[];
  autoConfirmBooking?: boolean;
  allowReschedule?: boolean;
  cancellationWindowHours?: number;
  requireManualConfirmation?: boolean;
}

// ============================================
// Helper: Calculate total weekly capacity
// ============================================
function calculateTotalWeeklyCapacity(operatingDays: OperatingDay[]): number {
  return operatingDays.reduce((total, day) => total + day.capacity, 0);
}

function getRequiredParam(value: string | string[] | undefined, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Valid ${field} is required`);
  }

  return value;
}

function toOperatingDays(value: unknown): OperatingDay[] {
  return Array.isArray(value) ? (value as unknown as OperatingDay[]) : [];
}

// ============================================
// GET /api/admin/labs
// List all labs with filters
// ============================================
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const statusParam = req.query.status;
    const searchParam = req.query.search;

    // Build where clause
    const where: Record<string, unknown> = {};

    const status = Array.isArray(statusParam) ? statusParam[0] : statusParam;
    if (status && status !== 'All') {
      where.isActive = status === 'ACTIVE';
    }

    const search = Array.isArray(searchParam) ? searchParam[0] : searchParam;
    if (search) {
      where.OR = [
        { name: { ilike: `%${search}%` } },
        { city: { ilike: `%${search}%` } },
        { state: { ilike: `%${search}%` } },
      ];
    }

    const labs = await prisma.lab.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    });

    const data = labs.map((lab) => {
      const operatingDays = toOperatingDays(lab.operatingDays);
      const bookingsCount = (lab as typeof lab & { _count: { bookings: number } })._count.bookings;
      return {
        id: lab.id,
        name: lab.name,
        city: lab.city,
        state: lab.state,
        address: lab.address,
        serviceTypes: lab.serviceTypes,
        resultTimeDays: lab.resultTimeDays,
        isActive: lab.isActive,
        operatingDays,
        autoConfirmBooking: lab.autoConfirmBooking,
        allowReschedule: lab.allowReschedule,
        cancellationWindowHours: lab.cancellationWindowHours,
        requireManualConfirmation: lab.requireManualConfirmation,
        createdAt: lab.createdAt,
        updatedAt: lab.updatedAt,
        // Derived fields for display
        location: `${lab.city}, ${lab.state}`,
        serviceType: lab.serviceTypes.includes('HOME_VISIT') ? 'Home visit available' : 'On-site only',
        resultTime: `${lab.resultTimeDays}-${lab.resultTimeDays + 2} days`,
        slotsConfigured: `${calculateTotalWeeklyCapacity(operatingDays)} total weekly capacity`,
        bookingsCount,
      };
    });

    res.json({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// GET /api/admin/labs/:id
// Get lab by ID
// ============================================
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = getRequiredParam(req.params.id, 'id');

    const lab = await prisma.lab.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!lab) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lab not found' },
      });
      return;
    }

    const operatingDays = toOperatingDays(lab.operatingDays);
    const bookingsCount = (lab as typeof lab & { _count: { bookings: number } })._count.bookings;

    res.json({
      success: true,
      data: {
        ...lab,
        operatingDays,
        totalWeeklyCapacity: calculateTotalWeeklyCapacity(operatingDays),
        bookingsCount,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// POST /api/admin/labs
// Create new lab
// ============================================
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const payload: CreateLabPayload = req.body;

    const lab = await prisma.lab.create({
      data: {
        name: payload.name,
        city: payload.city,
        state: payload.state,
        address: payload.address || null,
        serviceTypes: payload.serviceTypes || ['ON_SITE'],
        resultTimeDays: payload.resultTimeDays ?? 3,
        isActive: payload.isActive ?? true,
        operatingDays: ((payload.operatingDays ?? []) as unknown) as Prisma.InputJsonValue,
        autoConfirmBooking: payload.autoConfirmBooking ?? true,
        allowReschedule: payload.allowReschedule ?? true,
        cancellationWindowHours: payload.cancellationWindowHours ?? 24,
        requireManualConfirmation: payload.requireManualConfirmation ?? false,
      },
    });

    res.status(201).json({
      success: true,
      data: lab,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// PATCH /api/admin/labs/:id
// Update lab
// ============================================
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = getRequiredParam(req.params.id, 'id');
    const payload: Partial<CreateLabPayload> = req.body;

    // Check if lab exists
    const existing = await prisma.lab.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lab not found' },
      });
      return;
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.city !== undefined) updateData.city = payload.city;
    if (payload.state !== undefined) updateData.state = payload.state;
    if (payload.address !== undefined) updateData.address = payload.address;
    if (payload.serviceTypes !== undefined) updateData.serviceTypes = payload.serviceTypes;
    if (payload.resultTimeDays !== undefined) updateData.resultTimeDays = payload.resultTimeDays;
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive;
    if (payload.operatingDays !== undefined) {
      updateData.operatingDays = (payload.operatingDays as unknown) as Prisma.InputJsonValue;
    }
    if (payload.autoConfirmBooking !== undefined) updateData.autoConfirmBooking = payload.autoConfirmBooking;
    if (payload.allowReschedule !== undefined) updateData.allowReschedule = payload.allowReschedule;
    if (payload.cancellationWindowHours !== undefined) updateData.cancellationWindowHours = payload.cancellationWindowHours;
    if (payload.requireManualConfirmation !== undefined) updateData.requireManualConfirmation = payload.requireManualConfirmation;

    const lab = await prisma.lab.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: lab,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

// ============================================
// DELETE /api/admin/labs/:id
// Delete lab
// ============================================
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = getRequiredParam(req.params.id, 'id');

    // Check if lab exists
    const existing = await prisma.lab.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lab not found' },
      });
      return;
    }

    // Check if lab has bookings
    const bookingsCount = (existing as typeof existing & { _count: { bookings: number } })._count.bookings;
    if (bookingsCount > 0) {
      res.status(400).json({
        success: false,
        error: { code: 'HAS_BOOKINGS', message: 'Cannot delete lab with existing bookings. Deactivate instead.' },
      });
      return;
    }

    await prisma.lab.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: { message: 'Lab deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

export default router;
