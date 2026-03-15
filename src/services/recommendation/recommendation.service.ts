import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import { encryptionService } from '../../utils/encryption.js';
import { matchingService } from '../matching/matching.service.js';
import { AIProviderFactory } from '../ai/ai-provider.factory.js';
import { NotFoundError } from '../../api/middlewares/error.middleware.js';
import type {
  HealthIntakeData,
  BloodTestResult,
  RecommendationOutput,
  TreatmentPathway,
} from '../../types/index.js';

// ============================================
// Service Interface
// ============================================
export interface IRecommendationService {
  generateRecommendation(userId: string, intakeId: string): Promise<string>;
  getRecommendation(userId: string, recommendationId: string): Promise<RecommendationOutput>;
}

// ============================================
// Service Implementation
// ============================================
export class RecommendationService implements IRecommendationService {
  /**
   * Generate new recommendation based on intake and available blood tests
   */
  async generateRecommendation(userId: string, intakeId: string): Promise<string> {
    logger.info('Generating recommendation', { userId, intakeId });

    // 1. Fetch Intake
    const intake = await prisma.healthIntake.findFirst({
      where: { id: intakeId, userId },
    });

    if (!intake) {
      throw new NotFoundError('Health intake');
    }

    // 2. Fetch completed blood tests (if any)
    const bloodTests = await prisma.bloodTest.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      include: { biomarkerResults: { include: { biomarker: true } } },
    });

    // Decrypt intake data
    const intakeData = JSON.parse(
      encryptionService.decrypt(intake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // Prepare blood test results
    const bloodTestResults: BloodTestResult[] = [];
    for (const test of bloodTests) {
      for (const result of test.biomarkerResults) {
        const bloodTestResult: BloodTestResult = {
          biomarkerCode: result.biomarker.code,
          value: Number(result.value),
          unit: result.unit,
          isAbnormal: result.isAbnormal,
        };
        if (result.referenceMin) {
          bloodTestResult.referenceMin = Number(result.referenceMin);
        }
        if (result.referenceMax) {
          bloodTestResult.referenceMax = Number(result.referenceMax);
        }
        bloodTestResults.push(bloodTestResult);
      }
    }

    // 3. Run Matching Engine
    const matches = await matchingService.findMatches({
      user: await prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      intake: intakeData,
      bloodTests: bloodTestResults,
    });

    // 4. Run AI Analysis using configured provider
    const aiProvider = AIProviderFactory.getProvider();
    logger.info('Running AI analysis for recommendation', {
      provider: aiProvider.getProviderName(),
      model: aiProvider.getModelVersion(),
    });

    const aiAnalysis = await aiProvider.analyzeHealth({
      intakeData,
      bloodTestResults,
    });

    // 5. Encrypt AI Summary
    const summaryEncrypted = encryptionService.encrypt(aiAnalysis.healthSummary);

    // 6. Save Recommendation
    const recommendation = await prisma.$transaction(async (tx) => {
      // Create Recommendation Record
      const rec = await tx.recommendation.create({
        data: {
          userId,
          healthIntakeId: intakeId,
          status: 'GENERATED',
          healthSummaryEncrypted: summaryEncrypted,
          primaryRecommendations: aiAnalysis.recommendations,
          aiModelVersion: aiAnalysis.modelVersion,
          promptVersion: aiAnalysis.promptVersion,
          tokensUsed: aiAnalysis.tokensUsed,
        },
      });

      // Create Treatment Matches
      for (const match of matches) {
        await tx.treatmentMatch.create({
          data: {
            recommendationId: rec.id,
            treatmentId: match.treatment.id,
            relevanceScore: match.score,
            matchReasons: match.matchReasons,
            contraindications: match.contraindications,
            isEligible: match.isEligible,
            displayOrder: matches.indexOf(match),
          },
        });
      }

      return rec;
    });

    logger.info('Recommendation generated successfully', { recommendationId: recommendation.id });
    return recommendation.id;
  }

  /**
   * Get recommendation details
   */
  async getRecommendation(userId: string, recommendationId: string): Promise<RecommendationOutput> {
    const rec = await prisma.recommendation.findFirst({
      where: { id: recommendationId, userId },
      include: {
        treatmentMatches: {
          include: { treatment: { include: { provider: true } } },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!rec) {
      throw new NotFoundError('Recommendation');
    }

    // Decrypt summary
    const healthSummaryText = encryptionService.decrypt(rec.healthSummaryEncrypted);

    // Map matches to TreatmentPathway

    const treatmentPathways: TreatmentPathway[] = rec.treatmentMatches.flatMap((m) => {
      if (!m.treatment.provider || !m.treatment.providerId) {
        return [];
      }

      return [{
        treatmentId: m.treatmentId,
        treatmentName: m.treatment.name,
        category: m.treatment.category,
        relevanceScore: Number(m.relevanceScore),
        matchReasons: m.matchReasons,
        contraindications: m.contraindications,
        isEligible: m.isEligible,
        providerName: m.treatment.provider.name,
        providerId: m.treatment.providerId,
        pricing: ((): {
          currency: string;
          oneTime?: number;
          subscription?: number;
          subscriptionFrequency?: string;
        } => {
          const p: {
            currency: string;
            oneTime?: number;
            subscription?: number;
            subscriptionFrequency?: string;
          } = { currency: m.treatment.currency };
          if (m.treatment.priceOneTime) {
            p.oneTime = Number(m.treatment.priceOneTime);
          }
          if (m.treatment.priceSubscription) {
            p.subscription = Number(m.treatment.priceSubscription);
          }
          if (m.treatment.subscriptionFrequency) {
            p.subscriptionFrequency = m.treatment.subscriptionFrequency;
          }
          return p;
        })(),
      }];
    });

    return {
      healthSummary: {
        overview: healthSummaryText,
        keyFindings: rec.primaryRecommendations,
        areasOfConcern: [],
        positiveIndicators: [],
      },
      treatmentPathways,
      supplementSuggestions: [],
      lifestyleRecommendations: rec.primaryRecommendations,
    };
  }
}

export const recommendationService = new RecommendationService();
export default recommendationService;
