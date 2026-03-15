/**
 * ExplanationService Tests
 * Tests for the "Why This?" explanation feature
 */

import {
  ExplanationService,
  type ExplanationReason,
  type PersonalizedFactor,
} from '../../services/explanation/explanation.service.js';

const mockGenerateExplanation = jest.fn();

// Mock dependencies
jest.mock('../../utils/database.js', () => ({
  prisma: {
    recommendation: {
      findFirst: jest.fn(),
    },
    treatmentMatch: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    bloodTest: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../utils/encryption.js', () => ({
  encryptionService: {
    decrypt: jest.fn(),
  },
}));

jest.mock('../../services/ai/ai-provider.factory.js', () => ({
  AIProviderFactory: {
    getProvider: jest.fn(() => ({
      generateExplanation: mockGenerateExplanation,
    })),
  },
}));

import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockEncryption = encryptionService as jest.Mocked<typeof encryptionService>;

describe('ExplanationService', () => {
  let service: ExplanationService;

  // Sample test data
  const mockUserId = 'user-123';
  const mockRecommendationId = 'rec-456';
  const mockTreatmentId = 'treat-789';

  const mockIntakeData = {
    medicalHistory: {
      conditions: ['hypertension'],
      surgeries: [],
      allergies: [],
      currentMedications: [],
    },
    familyHistory: { conditions: [] },
    symptoms: [
      { name: 'fatigue', severity: 'moderate' as const, duration: '3 months', frequency: 'daily' },
    ],
    goals: [
      {
        category: 'HORMONE_THERAPY',
        description: 'Optimize testosterone',
        priority: 'high' as const,
      },
    ],
    lifestyle: {
      smokingStatus: 'never' as const,
      alcoholConsumption: 'occasional' as const,
      exerciseFrequency: 'active' as const,
      dietType: 'balanced',
      sleepHours: 7,
      stressLevel: 'moderate' as const,
    },
    preferences: {
      riskTolerance: 'medium' as const,
      budgetSensitivity: 'medium' as const,
      preferSubscription: true,
      deliveryPreference: 'home' as const,
    },
  };

  const mockRecommendation = {
    id: mockRecommendationId,
    userId: mockUserId,
    healthIntake: {
      id: 'intake-123',
      intakeDataEncrypted: 'encrypted-data',
    },
    treatmentMatches: [
      {
        treatmentId: mockTreatmentId,
        relevanceScore: 0.85,
        matchReasons: [
          'Goal match: Hormone optimization aligns with your stated objectives',
          'Symptom match: Addresses reported fatigue symptoms',
          'Blood test eligibility: Your testosterone levels indicate suitability',
        ],
        contraindications: [],
        isEligible: true,
        treatment: {
          id: mockTreatmentId,
          name: 'TRT Therapy',
          category: 'HORMONE_THERAPY',
          description: 'Testosterone replacement therapy for hormone optimization',
          requiresBloodTest: true,
          provider: {
            name: 'Optimal Health Clinic',
          },
        },
      },
    ],
  };

  const mockUser = {
    id: mockUserId,
    dateOfBirth: new Date('1985-06-15'),
    gender: 'MALE',
  };

  beforeEach(() => {
    service = new ExplanationService();
    jest.clearAllMocks();
  });

  describe('getQuickExplanation', () => {
    it('should return quick summary with key reasons', async () => {
      // Arrange
      (mockPrisma.treatmentMatch.findFirst as jest.Mock).mockResolvedValue({
        treatmentId: mockTreatmentId,
        matchReasons: [
          'Goal match: Hormone optimization',
          'Symptom match: Fatigue',
          'Eligibility: Age appropriate',
          'Blood test: Compatible',
        ],
        treatment: {
          name: 'TRT Therapy',
        },
      });

      // Act
      const result = await service.getQuickExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.summary).toContain('TRT Therapy');
      expect(result.keyReasons).toHaveLength(3); // Should return top 3
      expect(result.keyReasons[0]).toBe('Goal match: Hormone optimization');
    });

    it('should throw NotFoundError when treatment match not found', async () => {
      // Arrange
      (mockPrisma.treatmentMatch.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getQuickExplanation(mockUserId, mockRecommendationId, mockTreatmentId)
      ).rejects.toThrow('Treatment match');
    });
  });

  describe('getExplanation', () => {
    beforeEach(() => {
      // Setup common mocks
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue(mockRecommendation);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.bloodTest.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.treatmentMatch.findMany as jest.Mock).mockResolvedValue([]);
      (mockEncryption.decrypt as jest.Mock).mockReturnValue(JSON.stringify(mockIntakeData));
      mockGenerateExplanation.mockResolvedValue(
        'This treatment works by optimizing hormone levels in a safe, monitored manner.'
      );
    });

    it('should return comprehensive explanation with all required fields', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.treatmentId).toBe(mockTreatmentId);
      expect(result.treatmentName).toBe('TRT Therapy');
      expect(result.category).toBe('HORMONE_THERAPY');
      expect(result.whyRecommended).toBeInstanceOf(Array);
      expect(result.whyRecommended.length).toBeGreaterThan(0);
      expect(result.howItWorks).toBeDefined();
      expect(result.evidenceSupport).toBeInstanceOf(Array);
      expect(result.personalizedFactors).toBeInstanceOf(Array);
      expect(result.limitations).toBeInstanceOf(Array);
      expect(result.disclaimers).toBeInstanceOf(Array);
      expect(result.disclaimers.length).toBeGreaterThan(0);
    });

    it('should include structured explanation reasons', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      const reasons = result.whyRecommended;
      expect(reasons.length).toBeGreaterThan(0);

      // Each reason should have required fields
      reasons.forEach((reason: ExplanationReason) => {
        expect(reason.type).toBeDefined();
        expect([
          'goal_match',
          'symptom_match',
          'biomarker_match',
          'lifestyle_match',
          'eligibility',
        ]).toContain(reason.type);
        expect(reason.title).toBeDefined();
        expect(reason.description).toBeDefined();
        expect(reason.confidence).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(reason.confidence);
      });
    });

    it('should include personalized factors based on intake data', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      const factors = result.personalizedFactors;
      expect(factors.length).toBeGreaterThan(0);

      // Should include age factor since user has dateOfBirth
      const ageFactor = factors.find((f: PersonalizedFactor) => f.factor === 'Age');
      expect(ageFactor).toBeDefined();

      // Should include active lifestyle factor
      const lifestyleFactor = factors.find(
        (f: PersonalizedFactor) => f.factor === 'Active Lifestyle'
      );
      expect(lifestyleFactor).toBeDefined();
      expect(lifestyleFactor?.impact).toBe('positive');
    });

    it('should include standard medical disclaimers', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.disclaimers).toContain(
        'This information is for educational purposes only and is not medical advice.'
      );
      expect(result.disclaimers).toContain(
        'Always consult with a qualified healthcare provider before starting any treatment.'
      );
    });

    it('should include evidence support for the treatment category', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.evidenceSupport.length).toBeGreaterThan(0);
      // HORMONE_THERAPY should have hormone-related evidence
      expect(result.evidenceSupport.some((e) => e.toLowerCase().includes('hormone'))).toBe(true);
    });

    it('should include limitations including blood test requirement', async () => {
      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.limitations.length).toBeGreaterThan(0);
      // Treatment requires blood test
      expect(result.limitations.some((l) => l.toLowerCase().includes('blood test'))).toBe(true);
    });

    it('should handle AI service failure gracefully', async () => {
      // Arrange
      (mockAnthropic.generateExplanation as jest.Mock).mockRejectedValue(
        new Error('AI service unavailable')
      );

      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert - should still return a result with fallback explanation
      expect(result).toBeDefined();
      expect(result.howItWorks).toBeDefined();
      expect(result.howItWorks.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundError when recommendation not found', async () => {
      // Arrange
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getExplanation(mockUserId, mockRecommendationId, mockTreatmentId)
      ).rejects.toThrow('Recommendation');
    });

    it('should throw NotFoundError when treatment match not found in recommendation', async () => {
      // Arrange
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue({
        ...mockRecommendation,
        treatmentMatches: [],
      });

      // Act & Assert
      await expect(
        service.getExplanation(mockUserId, mockRecommendationId, mockTreatmentId)
      ).rejects.toThrow('Treatment match');
    });
  });

  describe('biomarkerInsights', () => {
    it('should include biomarker insights when blood tests are available', async () => {
      // Arrange
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue(mockRecommendation);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.treatmentMatch.findMany as jest.Mock).mockResolvedValue([]);
      (mockEncryption.decrypt as jest.Mock).mockReturnValue(JSON.stringify(mockIntakeData));
      (mockAnthropic.generateExplanation as jest.Mock).mockResolvedValue('Treatment explanation');

      // Blood tests with results
      (mockPrisma.bloodTest.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'test-1',
          status: 'COMPLETED',
          biomarkerResults: [
            {
              biomarker: { code: 'TESTOSTERONE_TOTAL', name: 'Total Testosterone' },
              value: 250,
              unit: 'ng/dL',
              referenceMin: 300,
              referenceMax: 1000,
              isAbnormal: true,
            },
          ],
        },
      ]);

      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.biomarkerInsights).toBeDefined();
      expect(result.biomarkerInsights).toHaveLength(1);
      expect(result.biomarkerInsights?.[0]?.biomarkerCode).toBe('TESTOSTERONE_TOTAL');
      expect(result.biomarkerInsights?.[0]?.currentStatus).toBe('low');
      expect(result.biomarkerInsights?.[0]?.howTreatmentHelps).toBeDefined();
    });

    it('should not include biomarkerInsights when no blood tests', async () => {
      // Arrange
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue(mockRecommendation);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.bloodTest.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.treatmentMatch.findMany as jest.Mock).mockResolvedValue([]);
      (mockEncryption.decrypt as jest.Mock).mockReturnValue(JSON.stringify(mockIntakeData));
      (mockAnthropic.generateExplanation as jest.Mock).mockResolvedValue('Treatment explanation');

      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.biomarkerInsights).toBeUndefined();
    });
  });

  describe('relatedAlternatives', () => {
    it('should include related alternatives when available', async () => {
      // Arrange
      (mockPrisma.recommendation.findFirst as jest.Mock).mockResolvedValue(mockRecommendation);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.bloodTest.findMany as jest.Mock).mockResolvedValue([]);
      (mockEncryption.decrypt as jest.Mock).mockReturnValue(JSON.stringify(mockIntakeData));
      (mockAnthropic.generateExplanation as jest.Mock).mockResolvedValue('Treatment explanation');

      // Alternative treatments in same category
      (mockPrisma.treatmentMatch.findMany as jest.Mock).mockResolvedValue([
        {
          treatmentId: 'alt-1',
          treatment: {
            id: 'alt-1',
            name: 'HCG Therapy',
            description: 'An alternative approach to hormone optimization',
          },
        },
        {
          treatmentId: 'alt-2',
          treatment: {
            id: 'alt-2',
            name: 'Clomid Therapy',
            description: 'Selective estrogen receptor modulator approach',
          },
        },
      ]);

      // Act
      const result = await service.getExplanation(
        mockUserId,
        mockRecommendationId,
        mockTreatmentId
      );

      // Assert
      expect(result.relatedAlternatives).toBeDefined();
      expect(result.relatedAlternatives).toHaveLength(2);
      expect(result.relatedAlternatives?.[0]?.treatmentName).toBe('HCG Therapy');
    });
  });
});
