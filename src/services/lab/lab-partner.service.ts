import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import type { BloodTestResult } from '../../types/index.js';

// ============================================
// Lab Partner Types
// ============================================

/**
 * Lab partner configuration
 */
export interface LabPartnerConfig {
  id: string;
  name: string;
  code: string;
  apiEndpoint: string | null;
  supportedRegions: string[];
  isActive: boolean;
}

/**
 * Lab test kit order request
 */
export interface LabKitOrderRequest {
  userId: string;
  bloodTestId: string;
  panelType: string;
  biomarkersRequested: string[];
  shippingAddress: ShippingAddress;
  collectionPreference: 'home' | 'clinic' | 'mobile';
}

/**
 * Shipping address for kit delivery
 */
export interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

/**
 * Lab order response from partner
 */
export interface LabOrderResponse {
  success: boolean;
  orderId: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  kitBarcode?: string;
  labPartnerOrderId: string;
  instructions?: string[];
}

/**
 * Lab result webhook payload
 */
export interface LabResultWebhookPayload {
  labPartnerOrderId: string;
  testId: string;
  status: 'received' | 'processing' | 'completed' | 'failed';
  collectedAt?: string | undefined;
  completedAt?: string | undefined;
  results?: LabResultItem[] | undefined;
  pdfReportUrl?: string | undefined;
  errorMessage?: string | undefined;
}

/**
 * Individual result item from lab
 */
export interface LabResultItem {
  biomarkerCode: string;
  biomarkerName?: string | undefined;
  value: number;
  unit: string;
  referenceMin?: number | undefined;
  referenceMax?: number | undefined;
  flag?: 'normal' | 'low' | 'high' | 'critical' | undefined;
  notes?: string | undefined;
}

/**
 * Lab partner availability info
 */
export interface LabPartnerAvailability {
  partnerId: string;
  partnerName: string;
  isAvailable: boolean;
  estimatedTurnaround: number; // days
  pricing: {
    targeted: number;
    'goal-based': number;
    comprehensive: number;
  };
  coverage: string[];
}

// ============================================
// Lab Partner Adapter Interface
// ============================================

/**
 * Interface for lab partner API adapters
 * Each lab partner should implement this interface
 */
export interface ILabPartnerAdapter {
  readonly partnerCode: string;

  /**
   * Order a test kit from the lab partner
   */
  orderKit(request: LabKitOrderRequest): Promise<LabOrderResponse>;

  /**
   * Check order status
   */
  checkStatus(labOrderId: string): Promise<{
    status: string;
    trackingUrl?: string;
    estimatedCompletion?: Date;
  }>;

  /**
   * Cancel an order
   */
  cancelOrder(labOrderId: string): Promise<boolean>;

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(rawPayload: unknown): LabResultWebhookPayload;
}

// ============================================
// Mock Lab Partner Adapter (for development)
// ============================================

export class MockLabPartnerAdapter implements ILabPartnerAdapter {
  readonly partnerCode = 'MOCK_LAB';

  async orderKit(request: LabKitOrderRequest): Promise<LabOrderResponse> {
    logger.info('Mock lab partner: Ordering kit', {
      testId: request.bloodTestId,
      panel: request.panelType,
    });

    // Simulate order creation
    const orderId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    return {
      success: true,
      orderId,
      labPartnerOrderId: orderId,
      trackingNumber: `TRK${Date.now()}`,
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      kitBarcode: `KIT${Date.now()}`,
      instructions: [
        'Fast for 8-12 hours before collection',
        'Collect sample in the morning',
        'Use the provided return envelope',
        'Drop off at any post office or schedule pickup',
      ],
    };
  }

  async checkStatus(labOrderId: string): Promise<{
    status: string;
    trackingUrl?: string;
    estimatedCompletion?: Date;
  }> {
    logger.info('Mock lab partner: Checking status', { labOrderId });

    return {
      status: 'processing',
      trackingUrl: `https://mocklab.com/track/${labOrderId}`,
      estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    };
  }

  async cancelOrder(labOrderId: string): Promise<boolean> {
    logger.info('Mock lab partner: Cancelling order', { labOrderId });
    return true;
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // Mock always returns true for development
    return true;
  }

  parseWebhookPayload(rawPayload: unknown): LabResultWebhookPayload {
    // Basic parsing - in production, this would validate and transform
    return rawPayload as LabResultWebhookPayload;
  }
}

// ============================================
// Forth Lab Partner Adapter (Example Real Integration)
// ============================================

export class ForthLabAdapter implements ILabPartnerAdapter {
  readonly partnerCode = 'FORTH';
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor() {
    // Note: apiEndpoint would be used in production for actual API calls
    // const apiEndpoint = process.env['FORTH_API_ENDPOINT'] || 'https://api.forth.life';
    this.apiKey = process.env['FORTH_API_KEY'] || '';
    this.webhookSecret = process.env['FORTH_WEBHOOK_SECRET'] || '';
  }

  async orderKit(request: LabKitOrderRequest): Promise<LabOrderResponse> {
    logger.info('Forth Lab: Ordering kit', {
      testId: request.bloodTestId,
      panel: request.panelType,
    });

    // In production, this would make actual API call to Forth
    // For now, simulate the response structure Forth would return

    if (!this.apiKey) {
      throw new ValidationError('Forth Lab API key not configured');
    }

    // Simulated API call structure
    // const response = await fetch(`${this.apiEndpoint}/v1/orders`, {
    //     method: 'POST',
    //     headers: {
    //         'Authorization': `Bearer ${this.apiKey}`,
    //         'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //         customer: {
    //             name: request.shippingAddress.fullName,
    //             phone: request.shippingAddress.phone,
    //         },
    //         shipping: request.shippingAddress,
    //         panel_code: this.mapPanelToForthCode(request.panelType),
    //         biomarkers: request.biomarkersRequested,
    //     }),
    // });

    // Mock response for now
    const orderId = `FORTH-${Date.now()}`;

    return {
      success: true,
      orderId,
      labPartnerOrderId: orderId,
      trackingNumber: `FORTH-TRK-${Date.now()}`,
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
      kitBarcode: `FORTH-KIT-${Date.now()}`,
      instructions: [
        'Fast for 10-12 hours before collection',
        'Use the finger-prick collection device',
        'Fill the collection tube to the indicated line',
        'Post using the pre-paid envelope',
      ],
    };
  }

  async checkStatus(labOrderId: string): Promise<{
    status: string;
    trackingUrl?: string;
    estimatedCompletion?: Date;
  }> {
    logger.info('Forth Lab: Checking status', { labOrderId });

    // In production: actual API call
    return {
      status: 'sample_received',
      trackingUrl: `https://forth.life/track/${labOrderId}`,
      estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    };
  }

  async cancelOrder(labOrderId: string): Promise<boolean> {
    logger.info('Forth Lab: Cancelling order', { labOrderId });
    // In production: actual API call
    return true;
  }

  verifyWebhookSignature(_payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn('Forth Lab: Webhook secret not configured, skipping verification');
      return true;
    }

    // In production: verify HMAC signature
    // const crypto = require('crypto');
    // const expectedSignature = crypto
    //     .createHmac('sha256', this.webhookSecret)
    //     .update(payload)
    //     .digest('hex');
    // return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    return signature.length > 0; // Placeholder
  }

  parseWebhookPayload(rawPayload: unknown): LabResultWebhookPayload {
    const payload = rawPayload as {
      order_id: string;
      internal_reference: string;
      status: string;
      collected_at?: string;
      completed_at?: string;
      biomarkers?: Array<{
        code: string;
        name: string;
        value: number;
        unit: string;
        ref_low?: number;
        ref_high?: number;
        status?: string;
      }>;
      pdf_url?: string;
      error?: string;
    };

    const results: LabResultItem[] | undefined = payload.biomarkers?.map(
      (b): LabResultItem => ({
        biomarkerCode: b.code,
        biomarkerName: b.name,
        value: b.value,
        unit: b.unit,
        referenceMin: b.ref_low,
        referenceMax: b.ref_high,
        flag: this.mapForthFlag(b.status),
      })
    );

    return {
      labPartnerOrderId: payload.order_id,
      testId: payload.internal_reference,
      status: this.mapForthStatus(payload.status),
      collectedAt: payload.collected_at,
      completedAt: payload.completed_at,
      results,
      pdfReportUrl: payload.pdf_url,
      errorMessage: payload.error,
    };
  }

  private mapForthStatus(status: string): LabResultWebhookPayload['status'] {
    const statusMap: Record<string, LabResultWebhookPayload['status']> = {
      sample_received: 'received',
      in_analysis: 'processing',
      results_ready: 'completed',
      failed: 'failed',
      cancelled: 'failed',
    };
    return statusMap[status] || 'processing';
  }

  private mapForthFlag(status?: string): LabResultItem['flag'] {
    if (!status) {
      return 'normal';
    }
    const flagMap: Record<string, LabResultItem['flag']> = {
      normal: 'normal',
      low: 'low',
      high: 'high',
      critical_low: 'critical',
      critical_high: 'critical',
    };
    return flagMap[status] || 'normal';
  }
}

// ============================================
// Lab Partner Integration Service
// ============================================

export interface ILabPartnerService {
  /**
   * Get all available lab partners for a region
   */
  getAvailablePartners(region?: string): Promise<LabPartnerAvailability[]>;

  /**
   * Get a specific lab partner by ID or code
   */
  getPartner(idOrCode: string): Promise<LabPartnerConfig | null>;

  /**
   * Order a test kit through a lab partner
   */
  orderKit(
    bloodTestId: string,
    labPartnerId: string,
    shippingAddress: ShippingAddress,
    collectionPreference?: 'home' | 'clinic' | 'mobile'
  ): Promise<LabOrderResponse>;

  /**
   * Process incoming webhook from lab partner
   */
  processWebhook(partnerCode: string, payload: unknown, signature: string): Promise<void>;

  /**
   * Check status of an order
   */
  checkOrderStatus(bloodTestId: string): Promise<{
    status: string;
    trackingUrl?: string;
    estimatedCompletion?: Date;
  }>;

  /**
   * Cancel an order
   */
  cancelOrder(bloodTestId: string): Promise<boolean>;

  /**
   * Register a new lab partner adapter
   */
  registerAdapter(adapter: ILabPartnerAdapter): void;
}

export class LabPartnerService implements ILabPartnerService {
  private adapters: Map<string, ILabPartnerAdapter> = new Map();

  constructor() {
    // Register default adapters
    this.registerAdapter(new MockLabPartnerAdapter());
    this.registerAdapter(new ForthLabAdapter());
  }

  /**
   * Register a lab partner adapter
   */
  registerAdapter(adapter: ILabPartnerAdapter): void {
    this.adapters.set(adapter.partnerCode.toUpperCase(), adapter);
    logger.info('Lab partner adapter registered', { partnerCode: adapter.partnerCode });
  }

  /**
   * Get adapter for a partner code
   */
  private getAdapter(partnerCode: string): ILabPartnerAdapter {
    const adapter = this.adapters.get(partnerCode.toUpperCase());
    if (!adapter) {
      throw new ValidationError(`No adapter found for lab partner: ${partnerCode}`);
    }
    return adapter;
  }

  /**
   * Get all available lab partners for a region
   */
  async getAvailablePartners(region?: string): Promise<LabPartnerAvailability[]> {
    const partners = await prisma.labPartner.findMany({
      where: {
        isActive: true,
        ...(region && { supportedRegions: { has: region } }),
      },
    });

    return partners.map((p) => ({
      partnerId: p.id,
      partnerName: p.name,
      isAvailable: p.isActive,
      estimatedTurnaround: this.getEstimatedTurnaround(p.code),
      pricing: this.getPricing(p.code),
      coverage: p.supportedRegions,
    }));
  }

  /**
   * Get a specific lab partner
   */
  async getPartner(idOrCode: string): Promise<LabPartnerConfig | null> {
    const partner = await prisma.labPartner.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
    });

    if (!partner) {
      return null;
    }

    return {
      id: partner.id,
      name: partner.name,
      code: partner.code,
      apiEndpoint: partner.apiEndpoint,
      supportedRegions: partner.supportedRegions,
      isActive: partner.isActive,
    };
  }

  /**
   * Order a test kit through a lab partner
   */
  async orderKit(
    bloodTestId: string,
    labPartnerId: string,
    shippingAddress: ShippingAddress,
    collectionPreference: 'home' | 'clinic' | 'mobile' = 'home'
  ): Promise<LabOrderResponse> {
    // Get blood test
    const bloodTest = await prisma.bloodTest.findUnique({
      where: { id: bloodTestId },
      include: { user: true },
    });

    if (!bloodTest) {
      throw new NotFoundError('Blood test');
    }

    // Get lab partner
    const partner = await this.getPartner(labPartnerId);
    if (!partner) {
      throw new NotFoundError('Lab partner');
    }

    if (!partner.isActive) {
      throw new ValidationError('Lab partner is not active');
    }

    // Get adapter
    const adapter = this.getAdapter(partner.code);

    // Build order request
    const orderRequest: LabKitOrderRequest = {
      userId: bloodTest.userId,
      bloodTestId,
      panelType: bloodTest.panelType,
      biomarkersRequested: bloodTest.biomarkersRequested,
      shippingAddress,
      collectionPreference,
    };

    // Send order to lab partner
    const response = await adapter.orderKit(orderRequest);

    if (response.success) {
      // Update blood test with lab partner order info
      await prisma.bloodTest.update({
        where: { id: bloodTestId },
        data: {
          labPartnerId: partner.id,
          status: 'ORDERED',
          orderedAt: new Date(),
        },
      });

      // Log order metadata for debugging (in production, store in separate table)
      logger.debug('Order metadata', {
        labPartnerOrderId: response.labPartnerOrderId,
        trackingNumber: response.trackingNumber,
      });

      // We could store this in a separate table or in BloodTest
      // For now, we'll use the resultsEncrypted field for order metadata initially
      // OR create an audit log entry

      logger.info('Lab kit ordered successfully', {
        bloodTestId,
        labPartnerId: partner.id,
        labOrderId: response.labPartnerOrderId,
      });
    }

    return response;
  }

  /**
   * Process incoming webhook from lab partner
   */
  async processWebhook(partnerCode: string, payload: unknown, signature: string): Promise<void> {
    logger.info('Processing lab partner webhook', { partnerCode });

    const adapter = this.getAdapter(partnerCode);

    // Verify signature
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!adapter.verifyWebhookSignature(payloadString, signature)) {
      throw new ValidationError('Invalid webhook signature');
    }

    // Parse payload
    const result = adapter.parseWebhookPayload(payload);

    // Find blood test
    const bloodTest = await prisma.bloodTest.findUnique({
      where: { id: result.testId },
    });

    if (!bloodTest) {
      logger.warn('Blood test not found for webhook', { testId: result.testId });
      return;
    }

    // Process based on status
    switch (result.status) {
      case 'received':
        await this.handleSampleReceived(bloodTest.id, result);
        break;
      case 'processing':
        await this.handleProcessing(bloodTest.id, result);
        break;
      case 'completed':
        await this.handleResultsCompleted(bloodTest.id, result);
        break;
      case 'failed':
        await this.handleFailed(bloodTest.id, result);
        break;
    }
  }

  /**
   * Handle sample received status
   */
  private async handleSampleReceived(
    bloodTestId: string,
    result: LabResultWebhookPayload
  ): Promise<void> {
    await prisma.bloodTest.update({
      where: { id: bloodTestId },
      data: {
        status: 'SAMPLE_COLLECTED',
        sampleCollectedAt: result.collectedAt ? new Date(result.collectedAt) : new Date(),
      },
    });

    logger.info('Blood test sample received', { bloodTestId });
  }

  /**
   * Handle processing status
   */
  private async handleProcessing(
    bloodTestId: string,
    _result: LabResultWebhookPayload
  ): Promise<void> {
    await prisma.bloodTest.update({
      where: { id: bloodTestId },
      data: { status: 'PROCESSING' },
    });

    logger.info('Blood test processing', { bloodTestId });
  }

  /**
   * Handle completed results
   */
  private async handleResultsCompleted(
    bloodTestId: string,
    result: LabResultWebhookPayload
  ): Promise<void> {
    if (!result.results || result.results.length === 0) {
      logger.warn('No results in completed webhook', { bloodTestId });
      return;
    }

    // Convert to BloodTestResult format - filter out undefined values
    const bloodTestResults: BloodTestResult[] = result.results.map((r) => ({
      biomarkerCode: r.biomarkerCode,
      value: r.value,
      unit: r.unit,
      referenceMin: r.referenceMin ?? 0,
      referenceMax: r.referenceMax ?? 0,
      isAbnormal: r.flag === 'low' || r.flag === 'high' || r.flag === 'critical',
    }));

    // Encrypt results
    const resultsEncrypted = encryptionService.encrypt(
      JSON.stringify({
        results: bloodTestResults,
        pdfReportUrl: result.pdfReportUrl,
        completedAt: result.completedAt,
      })
    );

    // Transaction to update test and create biomarker results
    await prisma.$transaction(async (tx) => {
      // Update blood test
      await tx.bloodTest.update({
        where: { id: bloodTestId },
        data: {
          status: 'COMPLETED',
          resultsEncrypted,
          resultsReceivedAt: new Date(),
        },
      });

      // Store individual biomarker results
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      for (const r of result.results!) {
        // Find or create biomarker
        let biomarker = await tx.biomarker.findUnique({
          where: { code: r.biomarkerCode },
        });

        if (!biomarker) {
          biomarker = await tx.biomarker.create({
            data: {
              code: r.biomarkerCode,
              name: r.biomarkerName || r.biomarkerCode,
              unit: r.unit,
              category: 'general',
            },
          });
        }

        const isAbnormal = r.flag === 'low' || r.flag === 'high' || r.flag === 'critical';

        await tx.biomarkerResult.create({
          data: {
            bloodTestId,
            biomarkerId: biomarker.id,
            value: r.value,
            unit: r.unit,
            referenceMin: r.referenceMin ?? null,
            referenceMax: r.referenceMax ?? null,
            isAbnormal,
          },
        });
      }
    });

    logger.info('Blood test results completed', {
      bloodTestId,
      resultCount: result.results.length,
    });

    // Trigger notification (would be implemented in notification service)
    // await notificationService.sendBloodTestResultsReady(bloodTestId);
  }

  /**
   * Handle failed status
   */
  private async handleFailed(bloodTestId: string, result: LabResultWebhookPayload): Promise<void> {
    await prisma.bloodTest.update({
      where: { id: bloodTestId },
      data: {
        status: 'CANCELLED',
        // Store error in encrypted results
        resultsEncrypted: encryptionService.encrypt(
          JSON.stringify({
            error: result.errorMessage,
            failedAt: new Date().toISOString(),
          })
        ),
      },
    });

    logger.error('Blood test failed', { bloodTestId, error: result.errorMessage });
  }

  /**
   * Check order status
   */
  async checkOrderStatus(bloodTestId: string): Promise<{
    status: string;
    trackingUrl?: string;
    estimatedCompletion?: Date;
  }> {
    const bloodTest = await prisma.bloodTest.findUnique({
      where: { id: bloodTestId },
      include: { labPartner: true },
    });

    if (!bloodTest) {
      throw new NotFoundError('Blood test');
    }

    if (!bloodTest.labPartner) {
      return { status: bloodTest.status };
    }

    // Adapter for real-time status check (not used currently - local status returned)
    // const adapter = this.getAdapter(bloodTest.labPartner.code);
    // return adapter.checkStatus(labOrderId);

    // For now, return local status
    // In production, could call adapter.checkStatus() for real-time info
    return { status: bloodTest.status };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(bloodTestId: string): Promise<boolean> {
    const bloodTest = await prisma.bloodTest.findUnique({
      where: { id: bloodTestId },
      include: { labPartner: true },
    });

    if (!bloodTest) {
      throw new NotFoundError('Blood test');
    }

    // Only allow cancellation if not yet collected
    if (!['PENDING', 'ORDERED'].includes(bloodTest.status)) {
      throw new ValidationError('Cannot cancel blood test in current status');
    }

    if (bloodTest.labPartner) {
      // In production: use adapter to cancel with lab partner
      // const adapter = this.getAdapter(bloodTest.labPartner.code);
      // await adapter.cancelOrder(labPartnerOrderId);
    }

    await prisma.bloodTest.update({
      where: { id: bloodTestId },
      data: { status: 'CANCELLED' },
    });

    logger.info('Blood test cancelled', { bloodTestId });
    return true;
  }

  /**
   * Get estimated turnaround time for a partner
   */
  private getEstimatedTurnaround(partnerCode: string): number {
    const turnaroundMap: Record<string, number> = {
      MOCK_LAB: 5,
      FORTH: 3,
      THRIVA: 4,
      MEDICHECKS: 3,
    };
    return turnaroundMap[partnerCode.toUpperCase()] || 5;
  }

  /**
   * Get pricing for a partner
   */
  private getPricing(partnerCode: string): {
    targeted: number;
    'goal-based': number;
    comprehensive: number;
  } {
    const pricingMap: Record<
      string,
      { targeted: number; 'goal-based': number; comprehensive: number }
    > = {
      MOCK_LAB: { targeted: 49, 'goal-based': 99, comprehensive: 199 },
      FORTH: { targeted: 59, 'goal-based': 119, comprehensive: 249 },
      THRIVA: { targeted: 55, 'goal-based': 110, comprehensive: 220 },
      MEDICHECKS: { targeted: 45, 'goal-based': 95, comprehensive: 185 },
    };
    return (
      pricingMap[partnerCode.toUpperCase()] || {
        targeted: 50,
        'goal-based': 100,
        comprehensive: 200,
      }
    );
  }
}

// ============================================
// Singleton Instance
// ============================================
export const labPartnerService = new LabPartnerService();
export default labPartnerService;
