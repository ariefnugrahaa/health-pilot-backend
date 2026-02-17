import {
  LabPartnerService,
  MockLabPartnerAdapter,
  LabKitOrderRequest,
  ShippingAddress,
} from '../../services/lab/lab-partner.service.js';

// Mock dependencies
jest.mock('../../utils/database.js', () => ({
  prisma: {
    labPartner: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    bloodTest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    biomarker: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    biomarkerResult: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) =>
      callback({
        bloodTest: {
          update: jest.fn(),
        },
        biomarker: {
          findUnique: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'biomarker-1', code: 'TSH' }),
        },
        biomarkerResult: {
          create: jest.fn(),
        },
      })
    ),
  },
}));

jest.mock('../../utils/encryption.js', () => ({
  encryptionService: {
    encrypt: jest.fn((data) => `encrypted:${data}`),
    decrypt: jest.fn((data) => data.replace('encrypted:', '')),
  },
}));

jest.mock('../../utils/logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
  };
});

import { prisma } from '../../utils/database.js';

describe('LabPartnerService', () => {
  let service: LabPartnerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LabPartnerService();
  });

  describe('MockLabPartnerAdapter', () => {
    let adapter: MockLabPartnerAdapter;

    beforeEach(() => {
      adapter = new MockLabPartnerAdapter();
    });

    it('should have correct partner code', () => {
      expect(adapter.partnerCode).toBe('MOCK_LAB');
    });

    it('should successfully order a kit', async () => {
      const request: LabKitOrderRequest = {
        userId: 'user-123',
        bloodTestId: 'test-456',
        panelType: 'comprehensive',
        biomarkersRequested: ['TSH', 'TESTOSTERONE_TOTAL'],
        shippingAddress: createMockShippingAddress(),
        collectionPreference: 'home',
      };

      const response = await adapter.orderKit(request);

      expect(response.success).toBe(true);
      expect(response.orderId).toContain('MOCK-');
      expect(response.labPartnerOrderId).toBeDefined();
      expect(response.trackingNumber).toContain('TRK');
      expect(response.estimatedDelivery).toBeInstanceOf(Date);
      expect(response.kitBarcode).toContain('KIT');
      expect(response.instructions).toHaveLength(4);
    });

    it('should check order status', async () => {
      const status = await adapter.checkStatus('MOCK-123');

      expect(status.status).toBe('processing');
      expect(status.trackingUrl).toContain('mocklab.com');
      expect(status.estimatedCompletion).toBeInstanceOf(Date);
    });

    it('should cancel an order', async () => {
      const result = await adapter.cancelOrder('MOCK-123');
      expect(result).toBe(true);
    });

    it('should verify webhook signature (always true for mock)', () => {
      const isValid = adapter.verifyWebhookSignature('payload', 'signature');
      expect(isValid).toBe(true);
    });

    it('should parse webhook payload', () => {
      const rawPayload = {
        labPartnerOrderId: 'MOCK-123',
        testId: 'test-456',
        status: 'completed',
        results: [],
      };

      const parsed = adapter.parseWebhookPayload(rawPayload);

      expect(parsed.labPartnerOrderId).toBe('MOCK-123');
      expect(parsed.testId).toBe('test-456');
      expect(parsed.status).toBe('completed');
    });
  });

  describe('getAvailablePartners', () => {
    it('should return available partners', async () => {
      const mockPartners = [
        {
          id: 'partner-1',
          name: 'Test Lab',
          code: 'MOCK_LAB',
          isActive: true,
          supportedRegions: ['US', 'UK'],
        },
      ];

      (prisma.labPartner.findMany as jest.Mock).mockResolvedValue(mockPartners);

      const result = await service.getAvailablePartners();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        partnerId: 'partner-1',
        partnerName: 'Test Lab',
        isAvailable: true,
      });
      expect(result[0]?.pricing).toBeDefined();
      expect(result[0]?.estimatedTurnaround).toBeDefined();
    });

    it('should filter by region when provided', async () => {
      (prisma.labPartner.findMany as jest.Mock).mockResolvedValue([]);

      await service.getAvailablePartners('UK');

      expect(prisma.labPartner.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          supportedRegions: { has: 'UK' },
        },
      });
    });
  });

  describe('getPartner', () => {
    it('should return partner by ID', async () => {
      const mockPartner = {
        id: 'partner-1',
        name: 'Test Lab',
        code: 'MOCK_LAB',
        apiEndpoint: 'https://api.testlab.com',
        supportedRegions: ['US'],
        isActive: true,
      };

      (prisma.labPartner.findFirst as jest.Mock).mockResolvedValue(mockPartner);

      const result = await service.getPartner('partner-1');

      expect(result).toMatchObject({
        id: 'partner-1',
        name: 'Test Lab',
        code: 'MOCK_LAB',
      });
    });

    it('should return null for non-existent partner', async () => {
      (prisma.labPartner.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getPartner('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('orderKit', () => {
    const mockBloodTest = {
      id: 'test-123',
      userId: 'user-456',
      panelType: 'comprehensive',
      biomarkersRequested: ['TSH', 'TESTOSTERONE_TOTAL'],
      user: { id: 'user-456', email: 'test@example.com' },
    };

    const mockPartner = {
      id: 'partner-1',
      name: 'Mock Lab',
      code: 'MOCK_LAB',
      apiEndpoint: null,
      supportedRegions: ['US'],
      isActive: true,
    };

    beforeEach(() => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue(mockBloodTest);
      (prisma.labPartner.findFirst as jest.Mock).mockResolvedValue(mockPartner);
      (prisma.bloodTest.update as jest.Mock).mockResolvedValue({});
    });

    it('should successfully order a kit', async () => {
      const shippingAddress = createMockShippingAddress();

      const result = await service.orderKit('test-123', 'partner-1', shippingAddress, 'home');

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(prisma.bloodTest.update).toHaveBeenCalledWith({
        where: { id: 'test-123' },
        data: expect.objectContaining({
          labPartnerId: 'partner-1',
          status: 'ORDERED',
        }),
      });
    });

    it('should throw NotFoundError for non-existent blood test', async () => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.orderKit('non-existent', 'partner-1', createMockShippingAddress())
      ).rejects.toThrow();
    });

    it('should throw NotFoundError for non-existent lab partner', async () => {
      (prisma.labPartner.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.orderKit('test-123', 'non-existent', createMockShippingAddress())
      ).rejects.toThrow();
    });

    it('should throw ValidationError for inactive lab partner', async () => {
      (prisma.labPartner.findFirst as jest.Mock).mockResolvedValue({
        ...mockPartner,
        isActive: false,
      });

      await expect(
        service.orderKit('test-123', 'partner-1', createMockShippingAddress())
      ).rejects.toThrow('Lab partner is not active');
    });
  });

  describe('processWebhook', () => {
    const mockBloodTest = {
      id: 'test-123',
      userId: 'user-456',
      status: 'ORDERED',
    };

    beforeEach(() => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue(mockBloodTest);
      (prisma.bloodTest.update as jest.Mock).mockResolvedValue({});
    });

    it('should process received status', async () => {
      const payload = {
        labPartnerOrderId: 'MOCK-123',
        testId: 'test-123',
        status: 'received',
        collectedAt: '2026-01-28T10:00:00Z',
      };

      await service.processWebhook('MOCK_LAB', payload, 'signature');

      expect(prisma.bloodTest.update).toHaveBeenCalledWith({
        where: { id: 'test-123' },
        data: expect.objectContaining({
          status: 'SAMPLE_COLLECTED',
        }),
      });
    });

    it('should process processing status', async () => {
      const payload = {
        labPartnerOrderId: 'MOCK-123',
        testId: 'test-123',
        status: 'processing',
      };

      await service.processWebhook('MOCK_LAB', payload, 'signature');

      expect(prisma.bloodTest.update).toHaveBeenCalledWith({
        where: { id: 'test-123' },
        data: { status: 'PROCESSING' },
      });
    });

    it('should skip processing for non-existent blood test', async () => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue(null);

      const payload = {
        labPartnerOrderId: 'MOCK-123',
        testId: 'non-existent',
        status: 'received',
      };

      // Should not throw
      await service.processWebhook('MOCK_LAB', payload, 'signature');

      expect(prisma.bloodTest.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('should cancel a pending order', async () => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-123',
        status: 'ORDERED',
        labPartner: { code: 'MOCK_LAB' },
      });
      (prisma.bloodTest.update as jest.Mock).mockResolvedValue({});

      const result = await service.cancelOrder('test-123');

      expect(result).toBe(true);
      expect(prisma.bloodTest.update).toHaveBeenCalledWith({
        where: { id: 'test-123' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should throw error when trying to cancel collected sample', async () => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-123',
        status: 'SAMPLE_COLLECTED',
        labPartner: { code: 'MOCK_LAB' },
      });

      await expect(service.cancelOrder('test-123')).rejects.toThrow(
        'Cannot cancel blood test in current status'
      );
    });

    it('should throw NotFoundError for non-existent blood test', async () => {
      (prisma.bloodTest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelOrder('non-existent')).rejects.toThrow();
    });
  });
});

// Helper function
function createMockShippingAddress(): ShippingAddress {
  return {
    fullName: 'John Doe',
    addressLine1: '123 Main St',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US',
    phone: '+1 555 123 4567',
  };
}
