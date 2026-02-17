import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../api/middlewares/error.middleware.js';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export type AttributionEventType =
  | 'lead_received'
  | 'consultation_scheduled'
  | 'treatment_started'
  | 'subscription_created'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'treatment_completed';

export interface CreateAttributionEventDto {
  handoffId: string;
  eventType: AttributionEventType;
  revenueAmount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface AttributionSummary {
  totalLeads: number;
  totalConversions: number;
  conversionRate: number;
  totalRevenue: Decimal;
  totalCommission: Decimal;
  currency: string;
  eventBreakdown: Record<string, number>;
}

export interface ProviderAttributionReport {
  providerId: string;
  providerName: string;
  period: { start: Date; end: Date };
  summary: AttributionSummary;
  events: AttributionEventDetail[];
}

export interface AttributionEventDetail {
  id: string;
  eventType: string;
  revenueAmount: Decimal | null;
  commissionAmount: Decimal | null;
  occurredAt: Date;
}

// ============================================
// Service Interface
// ============================================

export interface IAttributionService {
  trackEvent(dto: CreateAttributionEventDto): Promise<string>;
  recordTreatmentStart(handoffId: string, revenueAmount: number): Promise<void>;
  recordSubscriptionRenewal(handoffId: string, revenueAmount: number): Promise<void>;
  getProviderReport(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderAttributionReport>;
  calculateCommission(revenueAmount: number, providerId: string): Promise<number>;
}

// ============================================
// Service Implementation
// ============================================

/**
 * Attribution Service
 * Tracks treatment initiation events, subscription renewals, and calculates revenue/commission.
 * Implements lifecycle attribution for provider monetization.
 */
export class AttributionService implements IAttributionService {
  /**
   * Track a generic attribution event
   */
  async trackEvent(dto: CreateAttributionEventDto): Promise<string> {
    const { handoffId, eventType, revenueAmount, currency = 'GBP', metadata } = dto;

    // Verify handoff exists
    const handoff = await prisma.providerHandoff.findUnique({
      where: { id: handoffId },
      include: { provider: true },
    });

    if (!handoff) {
      throw new NotFoundError('Provider handoff');
    }

    // Calculate commission if revenue is provided
    let commissionAmount: number | undefined;
    if (revenueAmount !== undefined && revenueAmount > 0) {
      commissionAmount = await this.calculateCommission(revenueAmount, handoff.providerId);
    }

    // Create attribution event
    const event = await prisma.attributionEvent.create({
      data: {
        handoffId,
        eventType,
        revenueAmount: revenueAmount !== undefined ? revenueAmount : null,
        commissionAmount: commissionAmount !== undefined ? commissionAmount : null,
        currency,
        ...(metadata !== undefined && { metadata: metadata as Prisma.InputJsonValue }),
        occurredAt: new Date(),
      },
    });

    logger.info('Attribution event tracked', {
      eventId: event.id,
      handoffId,
      eventType,
      revenueAmount,
      commissionAmount,
    });

    return event.id;
  }

  /**
   * Record treatment start - major conversion event
   */
  async recordTreatmentStart(handoffId: string, revenueAmount: number): Promise<void> {
    // Track the event
    await this.trackEvent({
      handoffId,
      eventType: 'treatment_started',
      revenueAmount,
      metadata: {
        source: 'provider_webhook',
        isFirstPurchase: true,
      },
    });

    // Update handoff status
    await prisma.providerHandoff.update({
      where: { id: handoffId },
      data: {
        status: 'TREATMENT_STARTED',
        treatmentStartedAt: new Date(),
      },
    });

    logger.info('Treatment start recorded', { handoffId, revenueAmount });
  }

  /**
   * Record subscription renewal - recurring revenue event
   */
  async recordSubscriptionRenewal(handoffId: string, revenueAmount: number): Promise<void> {
    // Get the handoff to check renewal count
    const handoff = await prisma.providerHandoff.findUnique({
      where: { id: handoffId },
      include: {
        attributionEvents: {
          where: { eventType: 'subscription_renewed' },
        },
      },
    });

    if (!handoff) {
      throw new NotFoundError('Provider handoff');
    }

    const renewalNumber = handoff.attributionEvents.length + 1;

    await this.trackEvent({
      handoffId,
      eventType: 'subscription_renewed',
      revenueAmount,
      metadata: {
        renewalNumber,
        source: 'provider_webhook',
      },
    });

    logger.info('Subscription renewal recorded', { handoffId, revenueAmount, renewalNumber });
  }

  /**
   * Get attribution report for a provider
   */
  async getProviderReport(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderAttributionReport> {
    // Verify provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundError('Provider');
    }

    // Get all handoffs for this provider in the period
    const handoffs = await prisma.providerHandoff.findMany({
      where: {
        providerId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        attributionEvents: {
          where: {
            occurredAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { occurredAt: 'desc' },
        },
      },
    });

    // Calculate summary
    const allEvents: AttributionEventDetail[] = [];
    const eventBreakdown: Record<string, number> = {};
    let totalRevenue = new Decimal(0);
    let totalCommission = new Decimal(0);
    let totalConversions = 0;

    for (const handoff of handoffs) {
      for (const event of handoff.attributionEvents) {
        allEvents.push({
          id: event.id,
          eventType: event.eventType,
          revenueAmount: event.revenueAmount,
          commissionAmount: event.commissionAmount,
          occurredAt: event.occurredAt,
        });

        // Count by event type
        eventBreakdown[event.eventType] = (eventBreakdown[event.eventType] || 0) + 1;

        // Sum revenue and commission
        if (event.revenueAmount) {
          totalRevenue = totalRevenue.add(event.revenueAmount);
        }
        if (event.commissionAmount) {
          totalCommission = totalCommission.add(event.commissionAmount);
        }

        // Count conversions (treatment_started)
        if (event.eventType === 'treatment_started') {
          totalConversions++;
        }
      }
    }

    const totalLeads = handoffs.length;
    const conversionRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;

    return {
      providerId,
      providerName: provider.name,
      period: { start: startDate, end: endDate },
      summary: {
        totalLeads,
        totalConversions,
        conversionRate: Math.round(conversionRate * 100) / 100,
        totalRevenue,
        totalCommission,
        currency: 'GBP',
        eventBreakdown,
      },
      events: allEvents,
    };
  }

  /**
   * Calculate commission based on provider's commission rate
   */
  async calculateCommission(revenueAmount: number, providerId: string): Promise<number> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { commissionRate: true },
    });

    if (!provider || !provider.commissionRate) {
      // Default commission rate: 10%
      return revenueAmount * 0.1;
    }

    const rate = Number(provider.commissionRate);
    return Math.round(revenueAmount * rate * 100) / 100;
  }
}

export const attributionService = new AttributionService();
export default attributionService;
