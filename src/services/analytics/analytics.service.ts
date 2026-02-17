import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import type { HealthIntakeData, Gender } from '../../types/index.js';
import type { Prisma, BloodTest, ProviderHandoff } from '@prisma/client';

// ============================================
// Prisma Client Type Workaround
// ============================================
// These types allow us to use analytics models before migration is applied.
// After running `prisma migrate dev` and `prisma generate`, these can be removed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = any;

/**
 * Analytics Treatment Outcome row type (before Prisma generates types)
 */
interface AnalyticsTreatmentOutcomeRow {
  convertedToTreatment: boolean;
  subscriptionActive: boolean | null;
  revenueGenerated: number | null;
  commissionGenerated: number | null;
}

/**
 * Provider Analytics Snapshot row type (before Prisma generates types)
 */
interface ProviderAnalyticsSnapshotRow {
  providerId: string;
  totalHandoffs: number;
  convertedHandoffs: number;
  conversionRate: number;
  activeSubscriptions: number;
  churnedSubscriptions: number;
  retentionRate: number | null;
  totalRevenue: number;
  totalCommission: number;
  avgRevenuePerHandoff: number | null;
  conversionRank: number | null;
  retentionRank: number | null;
  revenueRank: number | null;
}

// ============================================
// Types
// ============================================

/**
 * Age bucket ranges for anonymization
 */
const AGE_BUCKETS = [
  { min: 0, max: 17, label: 'under-18' },
  { min: 18, max: 24, label: '18-24' },
  { min: 25, max: 34, label: '25-34' },
  { min: 35, max: 44, label: '35-44' },
  { min: 45, max: 54, label: '45-54' },
  { min: 55, max: 64, label: '55-64' },
  { min: 65, max: 74, label: '65-74' },
  { min: 75, max: 999, label: '75+' },
];

/**
 * Biomarker status classification
 */
type BiomarkerStatus = 'low' | 'normal' | 'high' | 'abnormal';

/**
 * Blood test result for analytics processing

 */
interface BloodTestResultInput {
  biomarkerCode: string;
  value: number;
  referenceMin?: number;
  referenceMax?: number;
  isAbnormal: boolean;
}

/**
 * Provider performance metrics
 */
export interface ProviderPerformanceMetrics {
  providerId: string;
  providerName: string;
  totalHandoffs: number;
  convertedHandoffs: number;
  conversionRate: number;
  activeSubscriptions: number;
  churnedSubscriptions: number;
  retentionRate: number | null;
  totalRevenue: number;
  totalCommission: number;
  avgRevenuePerHandoff: number | null;
  conversionRank: number | null;
  retentionRank: number | null;
  revenueRank: number | null;
}

/**
 * Market benchmark data
 */
export interface MarketBenchmarks {
  avgConversionRate: number;
  avgRetentionRate: number;
  avgRevenuePerHandoff: number;
  totalProviders: number;
  totalHandoffs: number;
}

// ============================================
// Service Interface
// ============================================

export interface IAnalyticsService {
  /**
   * Record anonymized health intake data
   */
  recordHealthIntakeAnalytics(
    intakeId: string,
    intakeData: HealthIntakeData,
    userAge: number | null,
    userGender: Gender | null,
    region: string | null,
    completedAt: Date | null
  ): Promise<void>;

  /**
   * Record anonymized blood test data
   */
  recordBloodTestAnalytics(
    bloodTest: BloodTest,
    results: BloodTestResultInput[],
    userAge: number | null,
    userGender: string | null,
    labPartnerCode: string | null,
    region: string | null
  ): Promise<void>;

  /**
   * Record or update treatment outcome analytics
   */
  recordTreatmentOutcomeAnalytics(
    handoff: ProviderHandoff,
    treatmentCategory: string,
    userAge: number | null,
    userGender: string | null,
    region: string | null
  ): Promise<void>;

  /**
   * Generate daily provider analytics snapshot
   */
  generateProviderSnapshot(providerId: string, snapshotDate: Date): Promise<void>;

  /**
   * Get provider performance metrics
   */
  getProviderPerformance(providerId: string): Promise<ProviderPerformanceMetrics>;

  /**
   * Get market benchmarks
   */
  getMarketBenchmarks(): Promise<MarketBenchmarks>;
}

// ============================================
// Service Implementation
// ============================================

export class AnalyticsService implements IAnalyticsService {
  /**
   * Record anonymized health intake analytics
   */
  async recordHealthIntakeAnalytics(
    intakeId: string,
    intakeData: HealthIntakeData,
    userAge: number | null,
    userGender: Gender | null,
    region: string | null,
    completedAt: Date | null
  ): Promise<void> {
    try {
      // Anonymize age to bucket
      const ageBucket = this.getAgeBucket(userAge);

      // Extract symptom categories (anonymized)
      const symptomCategories = this.extractSymptomCategories(intakeData);

      // Extract lifestyle buckets
      const lifestyle = intakeData.lifestyle;

      await (prisma as PrismaAny).analyticsHealthIntake.upsert({
        where: { intakeId },
        create: {
          intakeId,
          ageBucket,
          gender: userGender ?? undefined,
          region,
          primaryGoals: intakeData.goals?.map((g) => g.category) ?? [],
          symptomCategories,
          hasChronicConditions: intakeData.medicalHistory?.hasChronicConditions ?? null,
          takingMedications: intakeData.medicalHistory?.currentMedications
            ? intakeData.medicalHistory.currentMedications.length > 0
            : null,
          exerciseLevel: this.categorizeExercise(lifestyle?.exerciseFrequency),
          stressLevel: lifestyle?.stressLevel ?? null,
          sleepQuality: this.categorizeSleep(lifestyle?.sleepHours),
          dietType: lifestyle?.dietType ?? null,
          riskTolerance: intakeData.preferences?.riskTolerance ?? null,
          budgetSensitivity: intakeData.preferences?.budgetSensitivity ?? null,
          preferSubscription: intakeData.preferences?.preferSubscription ?? null,
          intakeCompletedAt: completedAt,
        },
        update: {
          ageBucket,
          gender: userGender ?? undefined,
          region,
          primaryGoals: intakeData.goals?.map((g) => g.category) ?? [],
          symptomCategories,
          hasChronicConditions: intakeData.medicalHistory?.hasChronicConditions ?? null,
          takingMedications: intakeData.medicalHistory?.currentMedications
            ? intakeData.medicalHistory.currentMedications.length > 0
            : null,
          exerciseLevel: this.categorizeExercise(lifestyle?.exerciseFrequency),
          stressLevel: lifestyle?.stressLevel ?? null,
          sleepQuality: this.categorizeSleep(lifestyle?.sleepHours),
          dietType: lifestyle?.dietType ?? null,
          riskTolerance: intakeData.preferences?.riskTolerance ?? null,
          budgetSensitivity: intakeData.preferences?.budgetSensitivity ?? null,
          preferSubscription: intakeData.preferences?.preferSubscription ?? null,
          intakeCompletedAt: completedAt,
        },
      });

      logger.info('Recorded health intake analytics', { intakeId, ageBucket });
    } catch (error) {
      // Analytics should not fail the main operation
      logger.error('Failed to record health intake analytics', { intakeId, error });
    }
  }

  /**
   * Record anonymized blood test analytics
   */
  async recordBloodTestAnalytics(
    bloodTest: BloodTest,
    results: BloodTestResultInput[],
    userAge: number | null,
    userGender: string | null,
    labPartnerCode: string | null,
    region: string | null
  ): Promise<void> {
    try {
      const ageBucket = this.getAgeBucket(userAge);

      // Convert biomarker values to status flags
      const biomarkerFlags: Record<string, BiomarkerStatus> = {};
      let abnormalCount = 0;

      for (const result of results) {
        const status = this.classifyBiomarkerStatus(result);
        biomarkerFlags[result.biomarkerCode] = status;
        if (result.isAbnormal) {
          abnormalCount++;
        }
      }

      await (prisma as PrismaAny).analyticsBloodTest.upsert({
        where: { bloodTestId: bloodTest.id },
        create: {
          bloodTestId: bloodTest.id,
          panelType: bloodTest.panelType,
          labPartnerCode,
          region,
          biomarkerFlags: biomarkerFlags as unknown as Prisma.InputJsonValue,
          abnormalCount,
          totalBiomarkers: results.length,
          ageBucket,
          gender: userGender,
          resultsReceivedAt: bloodTest.resultsReceivedAt,
        },
        update: {
          biomarkerFlags: biomarkerFlags as unknown as Prisma.InputJsonValue,
          abnormalCount,
          totalBiomarkers: results.length,
          resultsReceivedAt: bloodTest.resultsReceivedAt,
        },
      });

      logger.info('Recorded blood test analytics', {
        bloodTestId: bloodTest.id,
        abnormalCount,
      });
    } catch (error) {
      logger.error('Failed to record blood test analytics', {
        bloodTestId: bloodTest.id,
        error,
      });
    }
  }

  /**
   * Record treatment outcome analytics (called on handoff status updates)
   */
  async recordTreatmentOutcomeAnalytics(
    handoff: ProviderHandoff,
    treatmentCategory: string,
    userAge: number | null,
    userGender: string | null,
    region: string | null
  ): Promise<void> {
    try {
      const ageBucket = this.getAgeBucket(userAge);
      const converted = ['TREATMENT_STARTED', 'COMPLETED'].includes(handoff.status);

      // Calculate days to conversion if applicable
      let daysToConversion: number | null = null;
      if (converted && handoff.treatmentStartedAt) {
        const diffMs = handoff.treatmentStartedAt.getTime() - handoff.initiatedAt.getTime();
        daysToConversion = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      // Get revenue data from attribution events
      const attributionEvents = await prisma.attributionEvent.findMany({
        where: { handoffId: handoff.id },
      });

      const revenueGenerated = attributionEvents.reduce(
        (sum, e) => sum + Number(e.revenueAmount ?? 0),
        0
      );
      const commissionGenerated = attributionEvents.reduce(
        (sum, e) => sum + Number(e.commissionAmount ?? 0),
        0
      );

      // Check if subscription is active
      const subscriptionEvents = attributionEvents.filter(
        (e) => e.eventType === 'subscription_renewed'
      );
      const subscriptionActive = subscriptionEvents.length > 0;
      const subscriptionMonths = subscriptionEvents.length;

      // Get treatmentId from recommendation
      const recommendation = await prisma.recommendation.findUnique({
        where: { id: handoff.recommendationId },
        include: {
          treatmentMatches: {
            take: 1,
            orderBy: { relevanceScore: 'desc' },
          },
        },
      });
      const treatmentId = recommendation?.treatmentMatches[0]?.treatmentId ?? handoff.providerId;

      await (prisma as PrismaAny).analyticsTreatmentOutcome.upsert({
        where: { handoffId: handoff.id },
        create: {
          handoffId: handoff.id,
          providerId: handoff.providerId,
          treatmentId,
          treatmentCategory,
          handoffStatus: handoff.status,
          convertedToTreatment: converted,
          subscriptionActive,
          daysToConversion,
          subscriptionMonths,
          revenueGenerated,
          commissionGenerated,
          ageBucket,
          gender: userGender,
          region,
          handoffInitiatedAt: handoff.initiatedAt,
          lastUpdatedAt: new Date(),
        },
        update: {
          handoffStatus: handoff.status,
          convertedToTreatment: converted,
          subscriptionActive,
          daysToConversion,
          subscriptionMonths,
          revenueGenerated,
          commissionGenerated,
          lastUpdatedAt: new Date(),
        },
      });

      logger.info('Recorded treatment outcome analytics', {
        handoffId: handoff.id,
        converted,
      });
    } catch (error) {
      logger.error('Failed to record treatment outcome analytics', {
        handoffId: handoff.id,
        error,
      });
    }
  }

  /**
   * Generate daily provider analytics snapshot
   * This should be run as a scheduled job
   */
  async generateProviderSnapshot(providerId: string, snapshotDate: Date): Promise<void> {
    try {
      // Get all outcomes for this provider
      // Cast to AnalyticsTreatmentOutcomeRow[] until Prisma migration is applied
      const outcomes = (await (prisma as PrismaAny).analyticsTreatmentOutcome.findMany({
        where: { providerId },
      })) as AnalyticsTreatmentOutcomeRow[];

      const totalHandoffs = outcomes.length;
      const convertedHandoffs = outcomes.filter(
        (o: AnalyticsTreatmentOutcomeRow) => o.convertedToTreatment
      ).length;
      const conversionRate = totalHandoffs > 0 ? convertedHandoffs / totalHandoffs : 0;

      const activeSubscriptions = outcomes.filter(
        (o: AnalyticsTreatmentOutcomeRow) => o.subscriptionActive === true
      ).length;
      const churnedSubscriptions = outcomes.filter(
        (o: AnalyticsTreatmentOutcomeRow) =>
          o.convertedToTreatment && o.subscriptionActive === false
      ).length;
      const retentionRate = convertedHandoffs > 0 ? activeSubscriptions / convertedHandoffs : null;

      const totalRevenue = outcomes.reduce(
        (sum: number, o: AnalyticsTreatmentOutcomeRow) => sum + Number(o.revenueGenerated ?? 0),
        0
      );
      const totalCommission = outcomes.reduce(
        (sum: number, o: AnalyticsTreatmentOutcomeRow) => sum + Number(o.commissionGenerated ?? 0),
        0
      );
      const avgRevenuePerHandoff = totalHandoffs > 0 ? totalRevenue / totalHandoffs : null;

      // Calculate percentile ranks compared to all providers
      const { conversionRank, retentionRank, revenueRank } = await this.calculateProviderRanks(
        providerId,
        conversionRate,
        retentionRate,
        avgRevenuePerHandoff
      );

      // Normalize date to start of day
      const normalizedDate = new Date(snapshotDate);
      normalizedDate.setHours(0, 0, 0, 0);

      await (prisma as PrismaAny).providerAnalyticsSnapshot.upsert({
        where: {
          providerId_snapshotDate: {
            providerId,
            snapshotDate: normalizedDate,
          },
        },
        create: {
          providerId,
          snapshotDate: normalizedDate,
          totalHandoffs,
          convertedHandoffs,
          conversionRate,
          activeSubscriptions,
          churnedSubscriptions,
          retentionRate,
          totalRevenue,
          totalCommission,
          avgRevenuePerHandoff,
          conversionRank,
          retentionRank,
          revenueRank,
        },
        update: {
          totalHandoffs,
          convertedHandoffs,
          conversionRate,
          activeSubscriptions,
          churnedSubscriptions,
          retentionRate,
          totalRevenue,
          totalCommission,
          avgRevenuePerHandoff,
          conversionRank,
          retentionRank,
          revenueRank,
        },
      });

      logger.info('Generated provider analytics snapshot', {
        providerId,
        snapshotDate: normalizedDate,
      });
    } catch (error) {
      logger.error('Failed to generate provider analytics snapshot', {
        providerId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get provider performance metrics
   */
  async getProviderPerformance(providerId: string): Promise<ProviderPerformanceMetrics> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { name: true },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    // Get latest snapshot
    const snapshot = await (prisma as PrismaAny).providerAnalyticsSnapshot.findFirst({
      where: { providerId },
      orderBy: { snapshotDate: 'desc' },
    }) as ProviderAnalyticsSnapshotRow | null;

    if (!snapshot) {
      // Return empty metrics if no snapshot exists
      return {
        providerId,
        providerName: provider.name,
        totalHandoffs: 0,
        convertedHandoffs: 0,
        conversionRate: 0,
        activeSubscriptions: 0,
        churnedSubscriptions: 0,
        retentionRate: null,
        totalRevenue: 0,
        totalCommission: 0,
        avgRevenuePerHandoff: null,
        conversionRank: null,
        retentionRank: null,
        revenueRank: null,
      };
    }

    return {
      providerId,
      providerName: provider.name,
      totalHandoffs: snapshot.totalHandoffs,
      convertedHandoffs: snapshot.convertedHandoffs,
      conversionRate: Number(snapshot.conversionRate),
      activeSubscriptions: snapshot.activeSubscriptions,
      churnedSubscriptions: snapshot.churnedSubscriptions,
      retentionRate: snapshot.retentionRate ? Number(snapshot.retentionRate) : null,
      totalRevenue: Number(snapshot.totalRevenue),
      totalCommission: Number(snapshot.totalCommission),
      avgRevenuePerHandoff: snapshot.avgRevenuePerHandoff
        ? Number(snapshot.avgRevenuePerHandoff)
        : null,
      conversionRank: snapshot.conversionRank,
      retentionRank: snapshot.retentionRank,
      revenueRank: snapshot.revenueRank,
    };
  }

  /**
   * Get market-wide benchmarks
   */
  async getMarketBenchmarks(): Promise<MarketBenchmarks> {
    // Get all provider snapshots from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshots = await (prisma as PrismaAny).providerAnalyticsSnapshot.findMany({
      where: {
        snapshotDate: { gte: thirtyDaysAgo },
      },
      orderBy: { snapshotDate: 'desc' },
      distinct: ['providerId'],
    }) as ProviderAnalyticsSnapshotRow[];

    if (snapshots.length === 0) {
      return {
        avgConversionRate: 0,
        avgRetentionRate: 0,
        avgRevenuePerHandoff: 0,
        totalProviders: 0,
        totalHandoffs: 0,
      };
    }

    const totalHandoffs = snapshots.reduce((sum: number, s: ProviderAnalyticsSnapshotRow) => sum + s.totalHandoffs, 0);
    const totalConverted = snapshots.reduce((sum: number, s: ProviderAnalyticsSnapshotRow) => sum + s.convertedHandoffs, 0);
    const avgConversionRate = totalHandoffs > 0 ? totalConverted / totalHandoffs : 0;

    const retentionRates = snapshots
      .filter((s: ProviderAnalyticsSnapshotRow) => s.retentionRate !== null)
      .map((s: ProviderAnalyticsSnapshotRow) => Number(s.retentionRate));
    const avgRetentionRate =
      retentionRates.length > 0
        ? retentionRates.reduce((sum: number, r: number) => sum + r, 0) / retentionRates.length
        : 0;

    const totalRevenue = snapshots.reduce((sum: number, s: ProviderAnalyticsSnapshotRow) => sum + Number(s.totalRevenue), 0);
    const avgRevenuePerHandoff = totalHandoffs > 0 ? totalRevenue / totalHandoffs : 0;

    return {
      avgConversionRate,
      avgRetentionRate,
      avgRevenuePerHandoff,
      totalProviders: snapshots.length,
      totalHandoffs,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Convert age to anonymized bucket
   */
  private getAgeBucket(age: number | null): string | null {
    if (age === null) {
      return null;
    }

    for (const bucket of AGE_BUCKETS) {
      if (age >= bucket.min && age <= bucket.max) {
        return bucket.label;
      }
    }
    return null;
  }

  /**
   * Extract symptom categories from intake data
   */
  private extractSymptomCategories(intakeData: HealthIntakeData): string[] {
    const categories = new Set<string>();

    if (intakeData.symptoms) {
      for (const symptom of intakeData.symptoms) {
        if (symptom.category) {
          categories.add(symptom.category);
        }
      }
    }

    return Array.from(categories);
  }

  /**
   * Categorize exercise frequency to bucket
   */
  private categorizeExercise(frequency: string | undefined): string | null {
    if (!frequency) {
      return null;
    }

    const frequencyLower = frequency.toLowerCase();
    if (frequencyLower === 'sedentary' || frequencyLower === 'none') {
      return 'sedentary';
    } else if (
      frequencyLower === 'light' ||
      frequencyLower === 'moderate' ||
      frequencyLower === '1-2_times_week' ||
      frequencyLower === '3-4_times_week'
    ) {
      return 'moderate';
    } else if (
      frequencyLower === 'active' ||
      frequencyLower === 'very_active' ||
      frequencyLower === '5+_times_week'
    ) {
      return 'active';
    }
    return 'moderate';
  }

  /**
   * Categorize sleep hours to quality bucket
   */
  private categorizeSleep(hours: number | undefined): string | null {
    if (hours === undefined) {
      return null;
    }

    if (hours < 5) {
      return 'poor';
    }
    if (hours < 7) {
      return 'fair';
    }
    return 'good';
  }

  /**
   * Classify biomarker value as low/normal/high
   */
  private classifyBiomarkerStatus(result: BloodTestResultInput): BiomarkerStatus {
    if (!result.isAbnormal) {
      return 'normal';
    }

    if (result.referenceMin !== undefined && result.value < result.referenceMin) {
      return 'low';
    }
    if (result.referenceMax !== undefined && result.value > result.referenceMax) {
      return 'high';
    }
    return 'abnormal';
  }

  /**
   * Calculate percentile ranks for a provider
   */
  private async calculateProviderRanks(
    _providerId: string,
    conversionRate: number,
    retentionRate: number | null,
    avgRevenue: number | null
  ): Promise<{
    conversionRank: number | null;
    retentionRank: number | null;
    revenueRank: number | null;
  }> {
    // Get all providers' latest snapshots
    const snapshots = await (prisma as PrismaAny).providerAnalyticsSnapshot.findMany({
      orderBy: { snapshotDate: 'desc' },
      distinct: ['providerId'],
    }) as ProviderAnalyticsSnapshotRow[];

    if (snapshots.length < 2) {
      return {
        conversionRank: null,
        retentionRank: null,
        revenueRank: null,
      };
    }

    // Calculate conversion rank
    const conversionRates = snapshots.map((s: ProviderAnalyticsSnapshotRow) => Number(s.conversionRate)).sort((a: number, b: number) => a - b);
    const conversionRank = Math.round(
      (conversionRates.filter((r: number) => r <= conversionRate).length / conversionRates.length) * 100
    );

    // Calculate retention rank
    let retentionRank: number | null = null;
    if (retentionRate !== null) {
      const retentionRates = snapshots
        .filter((s: ProviderAnalyticsSnapshotRow) => s.retentionRate !== null)
        .map((s: ProviderAnalyticsSnapshotRow) => Number(s.retentionRate))
        .sort((a: number, b: number) => a - b);

      if (retentionRates.length > 0) {
        retentionRank = Math.round(
          (retentionRates.filter((r: number) => r <= retentionRate).length / retentionRates.length) * 100
        );
      }
    }

    // Calculate revenue rank
    let revenueRank: number | null = null;
    if (avgRevenue !== null) {
      const revenues = snapshots
        .filter((s: ProviderAnalyticsSnapshotRow) => s.avgRevenuePerHandoff !== null)
        .map((s: ProviderAnalyticsSnapshotRow) => Number(s.avgRevenuePerHandoff))
        .sort((a: number, b: number) => a - b);

      if (revenues.length > 0) {
        revenueRank = Math.round(
          (revenues.filter((r: number) => r <= avgRevenue).length / revenues.length) * 100
        );
      }
    }

    return { conversionRank, retentionRank, revenueRank };
  }
}

// ============================================
// Singleton Instance
// ============================================
export const analyticsService = new AnalyticsService();
export default analyticsService;
