import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../api/middlewares/error.middleware.js';
import type { Gender } from '../../types/index.js';

// ============================================
// Dashboard Types
// ============================================

/**
 * Complete dashboard data for logged-in users
 */
export interface UserDashboard {
  profile: UserProfileSummary;
  healthJourney: HealthJourneySummary;
  activeHandoffs: HandoffSummary[];
  recentActivity: ActivityItem[];
  notifications: NotificationSummary;
  quickStats: QuickStats;
}

/**
 * User profile summary for dashboard header
 */
export interface UserProfileSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  isEmailVerified: boolean;
  profileCompleteness: number; // 0-100 percentage
  memberSince: Date;
  lastActive: Date | null;
}

/**
 * Health journey overview
 */
export interface HealthJourneySummary {
  totalIntakes: number;
  completedIntakes: number;
  latestIntake: LatestIntakeInfo | null;
  totalRecommendations: number;
  activeRecommendations: number;
  latestRecommendation: LatestRecommendationInfo | null;
  bloodTests: BloodTestSummary;
}

export interface LatestIntakeInfo {
  id: string;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  primaryGoals: string[];
}

export interface LatestRecommendationInfo {
  id: string;
  status: string;
  primaryRecommendations: string[];
  treatmentMatchCount: number;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface BloodTestSummary {
  totalTests: number;
  completedTests: number;
  pendingTests: number;
  latestTest: {
    id: string;
    status: string;
    panelType: string;
    resultsReceivedAt: Date | null;
    createdAt: Date;
  } | null;
}

/**
 * Provider handoff summary
 */
export interface HandoffSummary {
  id: string;
  status: string;
  providerName: string;
  providerLogo: string | null;
  createdAt: Date;
  lastUpdatedAt: Date;
  nextStep: string | null;
}

/**
 * Activity timeline item
 */
export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type ActivityType =
  | 'intake_started'
  | 'intake_completed'
  | 'recommendation_generated'
  | 'recommendation_viewed'
  | 'blood_test_ordered'
  | 'blood_test_completed'
  | 'handoff_initiated'
  | 'handoff_completed'
  | 'account_updated';

/**
 * Notification summary
 */
export interface NotificationSummary {
  unreadCount: number;
  recentNotifications: {
    id: string;
    type: string;
    title: string;
    isRead: boolean;
    createdAt: Date;
  }[];
}

/**
 * Quick stats for dashboard widgets
 */
export interface QuickStats {
  daysAsUser: number;
  treatmentsExplored: number;
  providersContacted: number;
  bloodTestsCompleted: number;
}

// ============================================
// Service Interface
// ============================================

export interface IDashboardService {
  /**
   * Get complete dashboard data for a user
   */
  getDashboard(userId: string): Promise<UserDashboard>;

  /**
   * Get profile summary only
   */
  getProfileSummary(userId: string): Promise<UserProfileSummary>;

  /**
   * Get health journey summary only
   */
  getHealthJourney(userId: string): Promise<HealthJourneySummary>;

  /**
   * Get active handoffs only
   */
  getActiveHandoffs(userId: string): Promise<HandoffSummary[]>;

  /**
   * Get recent activity timeline
   */
  getRecentActivity(userId: string, limit?: number): Promise<ActivityItem[]>;
}

// ============================================
// Service Implementation
// ============================================

export class DashboardService implements IDashboardService {
  /**
   * Get complete dashboard data
   */
  async getDashboard(userId: string): Promise<UserDashboard> {
    logger.info('Fetching user dashboard', { userId });

    // Fetch all data in parallel for efficiency
    const [profile, healthJourney, activeHandoffs, recentActivity, notifications, quickStats] =
      await Promise.all([
        this.getProfileSummary(userId),
        this.getHealthJourney(userId),
        this.getActiveHandoffs(userId),
        this.getRecentActivity(userId, 10),
        this.getNotificationSummary(userId),
        this.getQuickStats(userId),
      ]);

    return {
      profile,
      healthJourney,
      activeHandoffs,
      recentActivity,
      notifications,
      quickStats,
    };
  }

  /**
   * Get user profile summary
   */
  async getProfileSummary(userId: string): Promise<UserProfileSummary> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phoneNumber: true,
        isEmailVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Calculate profile completeness
    const profileCompleteness = this.calculateProfileCompleteness({
      email: user.email ?? '',
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      phoneNumber: user.phoneNumber,
      isEmailVerified: user.isEmailVerified,
    });

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email ?? '',
      isEmailVerified: user.isEmailVerified,
      profileCompleteness,
      memberSince: user.createdAt,
      lastActive: user.lastLoginAt,
    };
  }

  /**
   * Get health journey summary
   */
  async getHealthJourney(userId: string): Promise<HealthJourneySummary> {
    // Fetch intakes
    const intakes = await prisma.healthIntake.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        completedAt: true,
        createdAt: true,
        intakeDataEncrypted: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch recommendations with treatment matches count
    const recommendations = await prisma.recommendation.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        primaryRecommendations: true,
        createdAt: true,
        expiresAt: true,
        _count: {
          select: { treatmentMatches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch blood tests
    const bloodTests = await prisma.bloodTest.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        panelType: true,
        resultsReceivedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build latest intake info
    let latestIntake: LatestIntakeInfo | null = null;
    if (intakes.length > 0) {
      const intake = intakes[0];
      if (intake) {
        let primaryGoals: string[] = [];
        try {
          if (intake.status === 'COMPLETED' && intake.intakeDataEncrypted) {
            const decrypted = encryptionService.decrypt(intake.intakeDataEncrypted);
            const data = JSON.parse(decrypted) as { goals?: { category: string }[] };
            primaryGoals = data.goals?.map((g) => g.category).slice(0, 3) || [];
          }
        } catch {
          // Ignore decryption errors for summary
        }

        latestIntake = {
          id: intake.id,
          status: intake.status,
          completedAt: intake.completedAt,
          createdAt: intake.createdAt,
          primaryGoals,
        };
      }
    }

    // Build latest recommendation info
    let latestRecommendation: LatestRecommendationInfo | null = null;
    if (recommendations.length > 0) {
      const rec = recommendations[0];
      if (rec) {
        latestRecommendation = {
          id: rec.id,
          status: rec.status,
          primaryRecommendations: rec.primaryRecommendations.slice(0, 3),
          treatmentMatchCount: rec._count.treatmentMatches,
          createdAt: rec.createdAt,
          expiresAt: rec.expiresAt,
        };
      }
    }

    // Build blood test summary
    const completedTests = bloodTests.filter((t) => t.status === 'COMPLETED');
    const pendingTests = bloodTests.filter((t) =>
      ['ORDERED', 'COLLECTED', 'PROCESSING', 'PENDING'].includes(t.status)
    );

    let latestTestInfo: BloodTestSummary['latestTest'] = null;
    if (bloodTests.length > 0) {
      const latest = bloodTests[0];
      if (latest) {
        latestTestInfo = {
          id: latest.id,
          status: latest.status,
          panelType: latest.panelType,
          resultsReceivedAt: latest.resultsReceivedAt,
          createdAt: latest.createdAt,
        };
      }
    }

    const bloodTestSummary: BloodTestSummary = {
      totalTests: bloodTests.length,
      completedTests: completedTests.length,
      pendingTests: pendingTests.length,
      latestTest: latestTestInfo,
    };

    // Calculate active recommendations (not expired)
    const now = new Date();
    const activeRecommendations = recommendations.filter(
      (r) => !r.expiresAt || r.expiresAt > now
    ).length;

    return {
      totalIntakes: intakes.length,
      completedIntakes: intakes.filter((i) => i.status === 'COMPLETED').length,
      latestIntake,
      totalRecommendations: recommendations.length,
      activeRecommendations,
      latestRecommendation,
      bloodTests: bloodTestSummary,
    };
  }

  /**
   * Get active handoffs
   */
  async getActiveHandoffs(userId: string): Promise<HandoffSummary[]> {
    // Use status values from HandoffStatus enum: INITIATED, DATA_TRANSFERRED, PROVIDER_RECEIVED, CONSULTATION_SCHEDULED, TREATMENT_STARTED
    const handoffs = await prisma.providerHandoff.findMany({
      where: {
        userId,
        status: {
          in: [
            'INITIATED',
            'DATA_TRANSFERRED',
            'PROVIDER_RECEIVED',
            'CONSULTATION_SCHEDULED',
            'TREATMENT_STARTED',
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch provider info for each handoff
    const handoffSummaries: HandoffSummary[] = [];

    for (const h of handoffs) {
      const provider = await prisma.provider.findUnique({
        where: { id: h.providerId },
        select: { name: true, logoUrl: true },
      });

      handoffSummaries.push({
        id: h.id,
        status: h.status,
        providerName: provider?.name ?? 'Unknown Provider',
        providerLogo: provider?.logoUrl ?? null,
        createdAt: h.createdAt,
        lastUpdatedAt: h.updatedAt,
        nextStep: this.getNextStepForHandoff(h.status),
      });
    }

    return handoffSummaries;
  }

  /**
   * Get recent activity timeline
   */
  async getRecentActivity(userId: string, limit: number = 10): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = [];

    // Fetch recent intakes
    const intakes = await prisma.healthIntake.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const intake of intakes) {
      if (intake.status === 'COMPLETED' && intake.completedAt) {
        activities.push({
          id: `intake-complete-${intake.id}`,
          type: 'intake_completed',
          title: 'Health Intake Completed',
          description: 'You completed your health intake questionnaire.',
          timestamp: intake.completedAt,
        });
      }
      activities.push({
        id: `intake-start-${intake.id}`,
        type: 'intake_started',
        title: 'Health Intake Started',
        description: 'You started a new health intake.',
        timestamp: intake.createdAt,
      });
    }

    // Fetch recent recommendations
    const recommendations = await prisma.recommendation.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        viewedAt: true,
        _count: { select: { treatmentMatches: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const rec of recommendations) {
      if (rec.viewedAt) {
        activities.push({
          id: `rec-viewed-${rec.id}`,
          type: 'recommendation_viewed',
          title: 'Recommendations Viewed',
          description: 'You viewed your personalized treatment recommendations.',
          timestamp: rec.viewedAt,
        });
      }
      activities.push({
        id: `rec-generated-${rec.id}`,
        type: 'recommendation_generated',
        title: 'Recommendations Generated',
        description: `${rec._count.treatmentMatches} treatment options were matched to your profile.`,
        timestamp: rec.createdAt,
        metadata: { treatmentCount: rec._count.treatmentMatches },
      });
    }

    // Fetch recent blood tests
    const bloodTests = await prisma.bloodTest.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        resultsReceivedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const test of bloodTests) {
      if (test.status === 'COMPLETED' && test.resultsReceivedAt) {
        activities.push({
          id: `bloodtest-complete-${test.id}`,
          type: 'blood_test_completed',
          title: 'Blood Test Results Ready',
          description: 'Your blood test results are now available.',
          timestamp: test.resultsReceivedAt,
        });
      }
      if (['ORDERED', 'COLLECTED', 'PROCESSING', 'COMPLETED'].includes(test.status)) {
        activities.push({
          id: `bloodtest-ordered-${test.id}`,
          type: 'blood_test_ordered',
          title: 'Blood Test Ordered',
          description: 'You ordered a blood test kit.',
          timestamp: test.createdAt,
        });
      }
    }

    // Fetch recent handoffs
    const recentHandoffs = await prisma.providerHandoff.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const handoff of recentHandoffs) {
      // Fetch provider name
      const handoffProvider = await prisma.provider.findUnique({
        where: { id: handoff.providerId },
        select: { name: true },
      });
      const providerDisplayName = handoffProvider?.name ?? 'Provider';

      if (handoff.status === 'COMPLETED') {
        activities.push({
          id: `handoff-complete-${handoff.id}`,
          type: 'handoff_completed',
          title: 'Provider Connection Complete',
          description: `Your connection with ${providerDisplayName} is complete.`,
          timestamp: handoff.updatedAt,
        });
      }
      activities.push({
        id: `handoff-initiated-${handoff.id}`,
        type: 'handoff_initiated',
        title: 'Provider Connection Initiated',
        description: `You started connecting with ${providerDisplayName}.`,
        timestamp: handoff.createdAt,
        metadata: {
          providerId: handoff.providerId,
        },
      });
    }

    // Sort by timestamp descending and limit
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return activities.slice(0, limit);
  }

  /**
   * Get notification summary
   * Note: Returns empty if notifications table is not available
   */
  private async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    try {
      // Type assertion to access notification - may not be generated in client yet
      const prismaAny = prisma as unknown as { [key: string]: unknown };
      if (!prismaAny['notification']) {
        // Notifications table not available
        return { unreadCount: 0, recentNotifications: [] };
      }

      const notificationModel = prismaAny['notification'] as {
        count: (args: unknown) => Promise<number>;
        findMany: (args: unknown) => Promise<
          Array<{
            id: string;
            type: string;
            title: string;
            readAt: Date | null;
            createdAt: Date;
          }>
        >;
      };

      const [unreadCount, recentNotifications] = await Promise.all([
        notificationModel.count({
          where: { userId, readAt: null },
        }),
        notificationModel.findMany({
          where: { userId },
          select: {
            id: true,
            type: true,
            title: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      return {
        unreadCount,
        recentNotifications: recentNotifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          isRead: n.readAt !== null,
          createdAt: n.createdAt,
        })),
      };
    } catch {
      // If notification table doesn't exist, return empty
      return { unreadCount: 0, recentNotifications: [] };
    }
  }

  /**
   * Get quick stats
   */
  private async getQuickStats(userId: string): Promise<QuickStats> {
    const [user, treatmentMatches, handoffs, completedTests] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }),
      prisma.treatmentMatch.count({
        where: {
          recommendation: { userId },
        },
      }),
      prisma.providerHandoff.count({
        where: { userId },
      }),
      prisma.bloodTest.count({
        where: { userId, status: 'COMPLETED' },
      }),
    ]);

    const daysAsUser = user
      ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      daysAsUser,
      treatmentsExplored: treatmentMatches,
      providersContacted: handoffs,
      bloodTestsCompleted: completedTests,
    };
  }

  /**
   * Calculate profile completeness percentage
   */
  private calculateProfileCompleteness(user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: Date | null;
    gender: Gender | null;
    phoneNumber: string | null;
    isEmailVerified: boolean;
  }): number {
    const fields = [
      { value: user.email, weight: 15 },
      { value: user.firstName, weight: 15 },
      { value: user.lastName, weight: 15 },
      { value: user.dateOfBirth, weight: 15 },
      { value: user.gender, weight: 10 },
      { value: user.phoneNumber, weight: 15 },
      { value: user.isEmailVerified, weight: 15 },
    ];

    let completeness = 0;
    for (const field of fields) {
      if (field.value) {
        completeness += field.weight;
      }
    }

    return completeness;
  }

  /**
   * Get next step suggestion based on handoff status
   */
  private getNextStepForHandoff(status: string): string | null {
    const stepMap: Record<string, string> = {
      INITIATED: 'Waiting for provider to review your information.',
      IN_PROGRESS: 'Provider is processing your request.',
      PENDING_PROVIDER: 'Waiting for provider response.',
      PENDING_USER: 'Action required from you. Check your messages.',
    };

    return stepMap[status] || null;
  }
}

// ============================================
// Singleton Instance
// ============================================
export const dashboardService = new DashboardService();
export default dashboardService;
