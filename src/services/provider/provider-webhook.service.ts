import crypto from 'crypto';
import logger from '../../utils/logger.js';
import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import type { HealthIntakeData } from '../../types/index.js';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export type WebhookEventType = 'handoff' | 'status_update' | 'result' | 'cancellation';

export interface WebhookPayload {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  version: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  providerId: string;
  eventType: WebhookEventType;
  url: string;
  secret: string;
  headers?: Record<string, string>;
  retryCount?: number;
  timeoutMs?: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  duration?: number;
  error?: string;
  webhookLogId?: string;
}

export interface ProviderHandoffPayload {
  handoffId: string;
  attributionId: string;
  patient: {
    anonymousId: string;
    age?: number;
    gender?: string;
  };
  healthIntake: {
    completedAt: string;
    goals: string[];
    medicalHistorySummary: {
      hasChronicConditions: boolean;
      hasMedications: boolean;
      hasAllergies: boolean;
    };
    // Full intake data if provider accepts structured data
    fullData?: HealthIntakeData;
  };
  recommendation: {
    id: string;
    generatedAt: string;
    selectedTreatmentId: string;
    selectedTreatmentName: string;
  };
  bloodTests?: {
    testId: string;
    completedAt: string;
    biomarkers: Array<{
      code: string;
      name: string;
      value: number;
      unit: string;
      isAbnormal: boolean;
    }>;
  };
  consent: {
    dataShareConsent: boolean;
    timestamp: string;
  };
  metadata: {
    platform: string;
    version: string;
    sourceUrl: string;
  };
}

// ============================================
// Service Interface
// ============================================

export interface IProviderWebhookService {
  // Webhook Configuration
  configureWebhook(config: WebhookConfig): Promise<string>;
  updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): Promise<void>;
  deleteWebhook(webhookId: string): Promise<void>;
  getProviderWebhooks(providerId: string): Promise<unknown[]>;

  // Webhook Delivery
  sendHandoffWebhook(handoffId: string): Promise<WebhookDeliveryResult>;
  sendStatusUpdate(
    handoffId: string,
    newStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<WebhookDeliveryResult>;
  retryWebhook(webhookLogId: string): Promise<WebhookDeliveryResult>;

  // Webhook Verification
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  generateWebhookSignature(payload: string, secret: string): string;
}

// ============================================
// Service Implementation
// ============================================

export class ProviderWebhookService implements IProviderWebhookService {
  private readonly PLATFORM_NAME = 'HealthPilot';
  private readonly API_VERSION = '1.0';

  // ============================================
  // Webhook Configuration
  // ============================================

  /**
   * Configure a new webhook for a provider
   */
  async configureWebhook(config: WebhookConfig): Promise<string> {
    logger.info('Configuring webhook', {
      providerId: config.providerId,
      eventType: config.eventType,
    });

    // Validate URL
    try {
      new URL(config.url);
    } catch {
      throw new ValidationError('Invalid webhook URL');
    }

    // Generate secret if not provided
    const secret = config.secret || this.generateSecret();

    const webhook = await prisma.providerWebhook.create({
      data: {
        providerId: config.providerId,
        eventType: config.eventType,
        url: config.url,
        secret: encryptionService.encrypt(secret),
        headers: (config.headers as unknown as Prisma.InputJsonValue) ?? null,
        retryCount: config.retryCount ?? 3,
        timeoutMs: config.timeoutMs ?? 30000,
        isActive: true,
      },
    });

    return webhook.id;
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): Promise<void> {
    const data: Record<string, unknown> = {};

    if (updates.url) {
      try {
        new URL(updates.url);
        data['url'] = updates.url;
      } catch {
        throw new ValidationError('Invalid webhook URL');
      }
    }

    if (updates.secret) {
      data['secret'] = encryptionService.encrypt(updates.secret);
    }

    if (updates.headers !== undefined) {
      data['headers'] = updates.headers;
    }

    if (updates.retryCount !== undefined) {
      data['retryCount'] = updates.retryCount;
    }

    if (updates.timeoutMs !== undefined) {
      data['timeoutMs'] = updates.timeoutMs;
    }

    await prisma.providerWebhook.update({
      where: { id: webhookId },
      data,
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await prisma.providerWebhook.delete({
      where: { id: webhookId },
    });
  }

  /**
   * Get all webhooks for a provider
   */
  async getProviderWebhooks(providerId: string): Promise<unknown[]> {
    return prisma.providerWebhook.findMany({
      where: { providerId },
      select: {
        id: true,
        eventType: true,
        url: true,
        isActive: true,
        retryCount: true,
        timeoutMs: true,
        lastCallAt: true,
        lastStatus: true,
        failureCount: true,
        createdAt: true,
      },
    });
  }

  // ============================================
  // Webhook Delivery
  // ============================================

  /**
   * Send handoff data to provider via webhook
   */
  async sendHandoffWebhook(handoffId: string): Promise<WebhookDeliveryResult> {
    logger.info('Sending handoff webhook', { handoffId });

    // 1. Fetch handoff with all related data
    const handoff = await prisma.providerHandoff.findUnique({
      where: { id: handoffId },
      include: {
        provider: true,
        recommendation: {
          include: {
            healthIntake: true,
            treatmentMatches: {
              include: { treatment: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });

    if (!handoff) {
      throw new NotFoundError('Handoff');
    }

    // 2. Find active webhook for this provider
    const webhook = await prisma.providerWebhook.findFirst({
      where: {
        providerId: handoff.providerId,
        eventType: 'handoff',
        isActive: true,
      },
    });

    if (!webhook) {
      logger.warn('No active webhook configured for provider handoff', {
        providerId: handoff.providerId,
      });
      return {
        success: false,
        error: 'No webhook configured',
      };
    }

    // 3. Build handoff payload
    const payload = await this.buildHandoffPayload(handoff);

    // 4. Send webhook
    return this.deliverWebhook(
      webhook,
      'handoff',
      payload as unknown as Record<string, unknown>,
      handoffId
    );
  }

  /**
   * Send status update to HealthPilot from provider (incoming webhook handler helper)
   */
  async sendStatusUpdate(
    handoffId: string,
    newStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<WebhookDeliveryResult> {
    // This is called when WE receive a status update from the provider
    // and want to notify about it (could be for internal use or other integrations)

    logger.info('Processing status update', { handoffId, newStatus });

    // Update handoff status
    await prisma.providerHandoff.update({
      where: { id: handoffId },
      data: {
        status: newStatus as never,
        ...(newStatus === 'PROVIDER_RECEIVED' && { providerReceivedAt: new Date() }),
        ...(newStatus === 'CONSULTATION_SCHEDULED' && { consultationScheduledAt: new Date() }),
        ...(newStatus === 'TREATMENT_STARTED' && { treatmentStartedAt: new Date() }),
      },
    });

    // Create attribution event
    await prisma.attributionEvent.create({
      data: {
        handoffId,
        eventType: `status_${newStatus.toLowerCase()}`,
        occurredAt: new Date(),
        metadata: (metadata as unknown as Prisma.InputJsonValue) ?? null,
      },
    });

    return { success: true };
  }

  /**
   * Retry a failed webhook delivery
   */
  async retryWebhook(webhookLogId: string): Promise<WebhookDeliveryResult> {
    const log = await prisma.webhookLog.findUnique({
      where: { id: webhookLogId },
      include: { webhook: true },
    });

    if (!log) {
      throw new NotFoundError('Webhook log');
    }

    const webhook = log.webhook;
    const payload = log.requestPayload as Record<string, unknown>;

    return this.deliverWebhookToUrl(
      webhook.url,
      encryptionService.decrypt(webhook.secret),
      payload,
      webhook.headers as Record<string, string> | null,
      webhook.timeoutMs,
      log.attempt + 1,
      webhook.id,
      log.handoffId ?? undefined
    );
  }

  // ============================================
  // Signature Verification
  // ============================================

  /**
   * Generate HMAC signature for webhook payload
   */
  generateWebhookSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify incoming webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  // ============================================
  // Private Methods
  // ============================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildHandoffPayload(handoff: any): Promise<ProviderHandoffPayload> {
    // Decrypt intake data
    let intakeData: HealthIntakeData | undefined;
    try {
      intakeData = JSON.parse(
        encryptionService.decrypt(handoff.recommendation.healthIntake.intakeDataEncrypted)
      );
    } catch (error) {
      logger.error('Failed to decrypt intake data', { error });
    }

    // Find selected treatment
    const selectedMatch = handoff.recommendation.treatmentMatches.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.treatmentId === handoff.selectedTreatmentId
    );

    // Fetch blood tests if any
    const bloodTest = await prisma.bloodTest.findFirst({
      where: {
        userId: handoff.userId,
        status: 'COMPLETED',
      },
      include: {
        biomarkerResults: {
          include: { biomarker: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const handoffPayload: ProviderHandoffPayload = {
      handoffId: handoff.id,
      attributionId: handoff.attributionId,
      patient: {
        anonymousId: handoff.userId, // Consider using a separate anonymous ID
        gender: handoff.user.gender ?? undefined,
      },
      healthIntake: {
        completedAt:
          handoff.recommendation.healthIntake.completedAt?.toISOString() ??
          handoff.recommendation.healthIntake.createdAt.toISOString(),
        goals: handoff.recommendation.healthIntake.primaryGoals || [],
        medicalHistorySummary: {
          hasChronicConditions: handoff.recommendation.healthIntake.hasChronicConditions ?? false,
          hasMedications: handoff.recommendation.healthIntake.takingMedications ?? false,
          hasAllergies: false, // Would need to extract from intake data
        },
      },
      recommendation: {
        id: handoff.recommendationId,
        generatedAt: handoff.recommendation.createdAt.toISOString(),
        selectedTreatmentId: handoff.selectedTreatmentId ?? selectedMatch?.treatmentId,
        selectedTreatmentName: selectedMatch?.treatment.name ?? 'Unknown',
      },
      consent: {
        dataShareConsent: true,
        timestamp: handoff.createdAt.toISOString(),
      },
      metadata: {
        platform: this.PLATFORM_NAME,
        version: this.API_VERSION,
        sourceUrl: `https://healthpilot.com/handoff/${handoff.id}`,
      },
    };

    if (bloodTest) {
      handoffPayload.bloodTests = {
        testId: bloodTest.id,
        completedAt:
          bloodTest.resultsReceivedAt?.toISOString() ?? bloodTest.createdAt.toISOString(),
        biomarkers: bloodTest.biomarkerResults.map((r) => ({
          code: r.biomarker.code,
          name: r.biomarker.name,
          value: Number(r.value),
          unit: r.unit,
          isAbnormal: r.isAbnormal,
        })),
      };
    }

    if (handoff.user.dateOfBirth) {
      handoffPayload.patient.age = this.calculateAge(handoff.user.dateOfBirth);
    }

    if (intakeData) {
      handoffPayload.healthIntake.fullData = intakeData;
    }

    return handoffPayload;
  }

  private async deliverWebhook(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webhook: any,
    _eventType: WebhookEventType,
    data: Record<string, unknown>,
    handoffId?: string
  ): Promise<WebhookDeliveryResult> {
    const secret = encryptionService.decrypt(webhook.secret);
    const headers = webhook.headers as Record<string, string> | null;

    return this.deliverWebhookToUrl(
      webhook.url,
      secret,
      data,
      headers,
      webhook.timeoutMs,
      1,
      webhook.id,
      handoffId
    );
  }

  private async deliverWebhookToUrl(
    url: string,
    secret: string,
    data: Record<string, unknown>,
    customHeaders: Record<string, string> | null,
    timeoutMs: number,
    attempt: number,
    webhookId: string,
    handoffId?: string
  ): Promise<WebhookDeliveryResult> {
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const payload: WebhookPayload = {
      eventId,
      eventType: 'handoff',
      timestamp,
      version: this.API_VERSION,
      data,
    };

    const payloadString = JSON.stringify(payload);
    const signature = this.generateWebhookSignature(payloadString, secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-HealthPilot-Signature': signature,
      'X-HealthPilot-Event-Id': eventId,
      'X-HealthPilot-Timestamp': timestamp,
      ...(customHeaders || {}),
    };

    const startTime = Date.now();
    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let error: string | undefined;

    try {
      // Use native fetch (Node 18+)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      statusCode = response.status;
      responseBody = await response.text();

      if (!response.ok) {
        error = `HTTP ${statusCode}: ${responseBody.substring(0, 500)}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Webhook delivery failed', { url, error });
    }

    const duration = Date.now() - startTime;
    const success = statusCode !== undefined && statusCode >= 200 && statusCode < 300;

    // Log delivery attempt
    const log = await prisma.webhookLog.create({
      data: {
        webhookId,
        handoffId: handoffId ?? null,
        requestPayload: payload as unknown as Prisma.InputJsonValue,
        responseStatus: statusCode ?? null,
        responseBody: responseBody?.substring(0, 5000) ?? null,
        duration,
        error: error ?? null,
        attempt,
      },
    });

    // Update last status
    await prisma.providerWebhook.update({
      where: { id: webhookId },
      data: {
        lastCallAt: new Date(),
        lastStatus: statusCode ?? null,
        failureCount: success ? 0 : { increment: 1 },
      },
    });

    // Update handoff status if successful
    if (success && handoffId) {
      await prisma.providerHandoff.update({
        where: { id: handoffId },
        data: {
          status: 'DATA_TRANSFERRED',
          dataTransferredAt: new Date(),
        },
      });
    }

    const result: WebhookDeliveryResult = {
      success,
      duration,
      webhookLogId: log.id,
    };

    if (statusCode !== undefined) {
      result.statusCode = statusCode;
    }
    if (responseBody !== undefined) {
      result.responseBody = responseBody.substring(0, 1000);
    }
    if (error !== undefined) {
      result.error = error;
    }

    return result;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
}

// ============================================
// Singleton Instance
// ============================================

export const providerWebhookService = new ProviderWebhookService();
export default providerWebhookService;
