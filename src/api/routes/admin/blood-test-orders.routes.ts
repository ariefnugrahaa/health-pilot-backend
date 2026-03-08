import { Router, type Response } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { prisma } from '../../../utils/database.js';
import type { AuthenticatedRequest } from '../../../types/index.js';

const router = Router();

function formatUserName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || 'Anonymous User';
}

function getResultStatus(booking: {
  resultUploadedAt: Date | null;
  resultReviewed: boolean;
}): 'Uploaded' | 'Not Uploaded' | 'Reviewed' {
  if (booking.resultReviewed) {
    return 'Reviewed';
  }

  return booking.resultUploadedAt ? 'Uploaded' : 'Not Uploaded';
}

function parseSearch(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const status = parseSearch(req.query.status);
    const search = parseSearch(req.query.search);

    const where: Record<string, unknown> = {};

    if (status && status !== 'All') {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { timeSlot: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { lab: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const bookings = await prisma.labBooking.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        lab: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ bookingDate: 'desc' }, { createdAt: 'desc' }],
    });

    const data = bookings.map((booking) => ({
      id: booking.id,
      userName: formatUserName(booking.user),
      email: booking.user.email,
      labName: booking.lab.name,
      bookingDate: booking.bookingDate,
      timeSlot: booking.timeSlot,
      status: booking.status,
      resultStatus: getResultStatus(booking),
      resultFileName: booking.resultFileName,
      reviewedAt: booking.reviewedAt,
      bloodTestId: booking.bloodTestId,
    }));

    res.json({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseSearch(req.params.id);
    if (!id) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Blood test order id is required' },
      });
      return;
    }

    const booking = await prisma.labBooking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        lab: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            resultTimeDays: true,
            allowReschedule: true,
          },
        },
      },
    });

    if (!booking) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Blood test order not found' },
      });
      return;
    }

    const bloodTest = booking.bloodTestId
      ? await prisma.bloodTest.findUnique({
          where: { id: booking.bloodTestId },
          select: {
            id: true,
            status: true,
            panelType: true,
            orderedAt: true,
            resultsReceivedAt: true,
          },
        })
      : null;

    res.json({
      success: true,
      data: {
        id: booking.id,
        userName: formatUserName(booking.user),
        email: booking.user.email,
        selectedLab: booking.lab.name,
        labAddress: [booking.lab.address, `${booking.lab.city}, ${booking.lab.state}`]
          .filter(Boolean)
          .join(', '),
        bookingDate: booking.bookingDate,
        timeSlot: booking.timeSlot,
        bookingStatus: booking.status,
        resultStatus: getResultStatus(booking),
        resultFileName: booking.resultFileName,
        resultFileType: booking.resultFileType,
        resultUploadedAt: booking.resultUploadedAt,
        resultReviewed: booking.resultReviewed,
        reviewedAt: booking.reviewedAt,
        adminNotes: booking.adminNotes,
        bloodTest: bloodTest
          ? {
              id: bloodTest.id,
              status: bloodTest.status,
              panelType: bloodTest.panelType,
              orderedAt: bloodTest.orderedAt,
              resultsReceivedAt: bloodTest.resultsReceivedAt,
            }
          : null,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

router.patch(
  '/:id/result-management',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseSearch(req.params.id);
    if (!id) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Blood test order id is required' },
      });
      return;
    }

    const { adminNotes, resultReviewed, resultFileName, resultFileType, clearResultFile } =
      req.body as {
        adminNotes?: string;
        resultReviewed?: boolean;
        resultFileName?: string | null;
        resultFileType?: string | null;
        clearResultFile?: boolean;
      };

    const existing = await prisma.labBooking.findUnique({
      where: { id },
      select: { id: true, resultUploadedAt: true },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Blood test order not found' },
      });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (typeof adminNotes === 'string') {
      updateData.adminNotes = adminNotes;
    }

    if (typeof resultReviewed === 'boolean') {
      updateData.resultReviewed = resultReviewed;
      updateData.reviewedAt = resultReviewed ? new Date() : null;
    }

    if (clearResultFile) {
      updateData.resultFileName = null;
      updateData.resultFileType = null;
      updateData.resultUploadedAt = null;
    } else if (resultFileName) {
      updateData.resultFileName = resultFileName;
      updateData.resultFileType = resultFileType ?? null;
      updateData.resultUploadedAt = existing.resultUploadedAt ?? new Date();
    }

    const booking = await prisma.labBooking.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        id: booking.id,
        resultStatus: getResultStatus(booking),
        resultFileName: booking.resultFileName,
        resultFileType: booking.resultFileType,
        resultUploadedAt: booking.resultUploadedAt,
        resultReviewed: booking.resultReviewed,
        reviewedAt: booking.reviewedAt,
        adminNotes: booking.adminNotes,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

router.post(
  '/:id/actions',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseSearch(req.params.id);
    if (!id) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Blood test order id is required' },
      });
      return;
    }

    const action = parseSearch(req.body.action);
    const bookingDate = parseSearch(req.body.bookingDate);
    const timeSlot = parseSearch(req.body.timeSlot);

    const existing = await prisma.labBooking.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Blood test order not found' },
      });
      return;
    }

    let updateData: Record<string, unknown>;

    switch (action) {
      case 'MARK_COMPLETED':
        updateData = { status: 'COMPLETED' };
        break;
      case 'CANCEL_BOOKING':
        updateData = { status: 'CANCELLED' };
        break;
      case 'RESCHEDULE': {
        if (!bookingDate || !timeSlot) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Booking date and time slot are required' },
          });
          return;
        }

        updateData = {
          bookingDate: new Date(`${bookingDate}T12:00:00.000Z`),
          timeSlot,
          status: 'SCHEDULED',
        };
        break;
      }
      default:
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Unsupported action' },
        });
        return;
    }

    const booking = await prisma.labBooking.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingDate: booking.bookingDate,
        timeSlot: booking.timeSlot,
        status: booking.status,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  })
);

export default router;
