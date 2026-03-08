import { prisma } from '../../utils/database.js';

export interface AdminDashboardOverview {
  totalUsers: number;
  activeProviders: number;
  activeTreatments: number;
  activeSupplements: number;
  activeLabs: number;
  ordersRequiringAction: number;
}

export interface AdminDashboardRecommendationEngine {
  treatmentsConfigured: number;
  supplementsConfigured: number;
  matchingConflictsDetected: number;
}

export interface AdminDashboardBookingsDiagnostics {
  bookingsThisWeek: number;
  completionRate: number;
  resultsAwaitingReview: number;
}

export interface AdminDashboardOperationalAttention {
  providersIncomplete: number;
  labsWithoutSchedule: number;
  ordersOverdue: number;
}

export interface AdminDashboardData {
  overview: AdminDashboardOverview;
  recommendationEngine: AdminDashboardRecommendationEngine;
  bookingsDiagnostics: AdminDashboardBookingsDiagnostics;
  operationalAttention: AdminDashboardOperationalAttention;
}

function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start;
}

function getEndOfWeek(date: Date): Date {
  const end = getStartOfWeek(date);
  end.setDate(end.getDate() + 7);
  return end;
}

export class AdminDashboardService {
  async getDashboardData(): Promise<AdminDashboardData> {
    const now = new Date();
    const startOfWeek = getStartOfWeek(now);
    const endOfWeek = getEndOfWeek(now);

    const [
      totalUsers,
      activeProviders,
      activeTreatments,
      activeSupplements,
      activeLabs,
      pendingProviders,
      treatmentsConfigured,
      supplementsConfigured,
      bookingsThisWeek,
      completedBookingsThisWeek,
      resultsAwaitingReview,
      overdueOrders,
      flaggedOrders,
      matchingConflictsDetected,
      labs,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          role: 'USER',
          status: {
            not: 'DELETED',
          },
        },
      }),
      prisma.provider.count({
        where: {
          status: 'ACTIVE',
        },
      }),
      prisma.treatment.count({
        where: {
          isActive: true,
        },
      }),
      prisma.supplement.count({
        where: {
          isActive: true,
        },
      }),
      prisma.lab.count({
        where: {
          isActive: true,
        },
      }),
      prisma.provider.count({
        where: {
          status: 'PENDING_APPROVAL',
        },
      }),
      prisma.treatment.count({
        where: {
          isActive: true,
          includeInMatching: true,
        },
      }),
      prisma.supplement.count({
        where: {
          isActive: true,
        },
      }),
      prisma.labBooking.count({
        where: {
          bookingDate: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
        },
      }),
      prisma.labBooking.count({
        where: {
          bookingDate: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
          status: 'COMPLETED',
        },
      }),
      prisma.labBooking.count({
        where: {
          resultUploadedAt: {
            not: null,
          },
          resultReviewed: false,
        },
      }),
      prisma.labBooking.count({
        where: {
          bookingDate: {
            lt: now,
          },
          status: {
            in: ['PENDING', 'CONFIRMED'],
          },
        },
      }),
      prisma.labBooking.count({
        where: {
          OR: [
            {
              resultUploadedAt: {
                not: null,
              },
              resultReviewed: false,
            },
            {
              bookingDate: {
                lt: now,
              },
              status: {
                in: ['PENDING', 'CONFIRMED'],
              },
            },
          ],
        },
      }),
      prisma.treatment.count({
        where: {
          isActive: true,
          includeInMatching: true,
          OR: [
            {
              matchingRules: {
                none: {},
              },
            },
            {
              treatmentProviders: {
                none: {},
              },
            },
          ],
        },
      }),
      prisma.lab.findMany({
        select: {
          operatingDays: true,
        },
      }),
    ]);

    const labsWithoutSchedule = labs.filter((lab) => {
      const schedule = lab.operatingDays;

      if (!Array.isArray(schedule)) {
        return true;
      }

      return schedule.length === 0;
    }).length;

    const completionRate =
      bookingsThisWeek === 0 ? 0 : Math.round((completedBookingsThisWeek / bookingsThisWeek) * 100);

    return {
      overview: {
        totalUsers,
        activeProviders,
        activeTreatments,
        activeSupplements,
        activeLabs,
        ordersRequiringAction: flaggedOrders,
      },
      recommendationEngine: {
        treatmentsConfigured,
        supplementsConfigured,
        matchingConflictsDetected,
      },
      bookingsDiagnostics: {
        bookingsThisWeek,
        completionRate,
        resultsAwaitingReview,
      },
      operationalAttention: {
        providersIncomplete: pendingProviders,
        labsWithoutSchedule,
        ordersOverdue: overdueOrders,
      },
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
