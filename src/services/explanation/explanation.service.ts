import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../api/middlewares/error.middleware.js';
import { anthropicService } from '../ai/anthropic.service.js';
import type { HealthIntakeData, BloodTestResult } from '../../types/index.js';

// ============================================
// Types
// ============================================

/**
 * Structured explanation for "Why This?" feature
 * Provides comprehensive reasoning for treatment recommendations
 */
export interface TreatmentExplanation {
  treatmentId: string;
  treatmentName: string;
  category: string;

  // Why this treatment was recommended
  whyRecommended: ExplanationReason[];

  // How the treatment works (educational)
  howItWorks: string;

  // Evidence and scientific backing
  evidenceSupport: string[];

  // User-specific factors that influenced the match
  personalizedFactors: PersonalizedFactor[];

  // Biomarker insights if blood tests were available
  biomarkerInsights?: BiomarkerInsight[];

  // What this treatment won't do / limitations
  limitations: string[];

  // Important disclaimers
  disclaimers: string[];

  // Related alternatives user might consider
  relatedAlternatives?: RelatedTreatment[];
}

export interface ExplanationReason {
  type: 'goal_match' | 'symptom_match' | 'biomarker_match' | 'lifestyle_match' | 'eligibility';
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PersonalizedFactor {
  factor: string;
  impact: 'positive' | 'neutral' | 'consideration';
  description: string;
}

export interface BiomarkerInsight {
  biomarkerCode: string;
  biomarkerName: string;
  relevance: string;
  currentStatus: 'normal' | 'low' | 'high' | 'abnormal';
  howTreatmentHelps?: string;
}

export interface RelatedTreatment {
  treatmentId: string;
  treatmentName: string;
  differentiator: string;
}

// ============================================
// Explanation Context (Internal)
// ============================================

interface ExplanationContext {
  treatment: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    requiresBloodTest: boolean;
    provider: {
      name: string;
    };
  };
  matchReasons: string[];
  contraindications: string[];
  relevanceScore: number;
  isEligible: boolean;
  intakeData?: HealthIntakeData;
  bloodTestResults?: BloodTestResult[];
  userAge?: number;
  userGender?: string;
}

// ============================================
// Service Interface
// ============================================

export interface IExplanationService {
  /**
   * Get detailed explanation for why a treatment was recommended
   */
  getExplanation(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<TreatmentExplanation>;

  /**
   * Get quick summary explanation (less AI intensive)
   */
  getQuickExplanation(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<{ summary: string; keyReasons: string[] }>;
}

// ============================================
// Service Implementation
// ============================================

export class ExplanationService implements IExplanationService {
  /**
   * Standard medical/health disclaimers
   */
  private readonly standardDisclaimers = [
    'This information is for educational purposes only and is not medical advice.',
    'Always consult with a qualified healthcare provider before starting any treatment.',
    'Individual results may vary based on personal health factors.',
    'This platform does not diagnose conditions or prescribe treatments.',
  ];

  /**
   * Get detailed explanation for a treatment recommendation
   */
  async getExplanation(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<TreatmentExplanation> {
    logger.info('Generating treatment explanation', {
      userId,
      recommendationId,
      treatmentId,
    });

    // 1. Fetch all necessary context
    const context = await this.buildExplanationContext(userId, recommendationId, treatmentId);

    // 2. Build structured reasons from match data
    const whyRecommended = this.buildWhyRecommended(context);

    // 3. Build personalized factors
    const personalizedFactors = this.buildPersonalizedFactors(context);

    // 4. Build biomarker insights if available
    const biomarkerInsights = context.bloodTestResults
      ? this.buildBiomarkerInsights(context.bloodTestResults, context.treatment.name)
      : null;

    // 5. Generate AI-powered "how it works" explanation
    const howItWorks = await this.generateHowItWorks(context);

    // 6. Generate evidence support
    const evidenceSupport = await this.generateEvidenceSupport(context);

    // 7. Generate limitations
    const limitations = this.buildLimitations(context);

    // 8. Find related alternatives
    const relatedAlternatives = await this.findRelatedAlternatives(
      recommendationId,
      treatmentId,
      context.treatment.category
    );

    // Build result with explicit property assignment for TypeScript strict mode
    const result: TreatmentExplanation = {
      treatmentId: context.treatment.id,
      treatmentName: context.treatment.name,
      category: context.treatment.category,
      whyRecommended,
      howItWorks,
      evidenceSupport,
      personalizedFactors,
      limitations,
      disclaimers: this.standardDisclaimers,
    };

    // Add optional properties only if they have values
    if (biomarkerInsights && biomarkerInsights.length > 0) {
      result.biomarkerInsights = biomarkerInsights;
    }
    if (relatedAlternatives.length > 0) {
      result.relatedAlternatives = relatedAlternatives;
    }

    return result;
  }

  /**
   * Get quick summary explanation (cached/pre-computed where possible)
   */
  async getQuickExplanation(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<{ summary: string; keyReasons: string[] }> {
    const match = await prisma.treatmentMatch.findFirst({
      where: {
        recommendationId,
        treatmentId,
        recommendation: {
          userId,
        },
      },
      include: {
        treatment: true,
      },
    });

    if (!match) {
      throw new NotFoundError('Treatment match');
    }

    // Return pre-computed reasons from matching engine
    const keyReasons = match.matchReasons.slice(0, 3);
    const summary = `${match.treatment.name} was recommended based on ${keyReasons.length} key factors from your health profile.`;

    return {
      summary,
      keyReasons,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Build complete context for explanation generation
   */
  private async buildExplanationContext(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<ExplanationContext> {
    // Fetch recommendation with treatment match
    const recommendation = await prisma.recommendation.findFirst({
      where: {
        id: recommendationId,
        userId,
      },
      include: {
        healthIntake: true,
        treatmentMatches: {
          where: { treatmentId },
          include: {
            treatment: {
              include: {
                provider: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!recommendation) {
      throw new NotFoundError('Recommendation');
    }

    const match = recommendation.treatmentMatches[0];
    if (!match) {
      throw new NotFoundError('Treatment match');
    }

    // Fetch user for demographics
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        dateOfBirth: true,
        gender: true,
      },
    });

    // Decrypt intake data
    const intakeData = JSON.parse(
      encryptionService.decrypt(recommendation.healthIntake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // Fetch blood test results if any
    const bloodTests = await prisma.bloodTest.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      include: {
        biomarkerResults: {
          include: { biomarker: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const bloodTestResults: BloodTestResult[] = [];
    if (bloodTests.length > 0 && bloodTests[0]) {
      for (const result of bloodTests[0].biomarkerResults) {
        const bloodResult: BloodTestResult = {
          biomarkerCode: result.biomarker.code,
          value: Number(result.value),
          unit: result.unit,
          isAbnormal: result.isAbnormal,
        };
        if (result.referenceMin !== null) {
          bloodResult.referenceMin = Number(result.referenceMin);
        }
        if (result.referenceMax !== null) {
          bloodResult.referenceMax = Number(result.referenceMax);
        }
        bloodTestResults.push(bloodResult);
      }
    }

    // Calculate age if date of birth available
    let userAge: number | undefined;
    if (user?.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(user.dateOfBirth);
      userAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        userAge--;
      }
    }

    // Build context explicitly for TypeScript strict mode
    const context: ExplanationContext = {
      treatment: {
        id: match.treatment.id,
        name: match.treatment.name,
        category: match.treatment.category,
        description: match.treatment.description,
        requiresBloodTest: match.treatment.requiresBloodTest,
        provider: match.treatment.provider,
      },
      matchReasons: match.matchReasons,
      contraindications: match.contraindications,
      relevanceScore: Number(match.relevanceScore),
      isEligible: match.isEligible,
      intakeData,
    };

    // Add optional properties only when they have values
    if (bloodTestResults.length > 0) {
      context.bloodTestResults = bloodTestResults;
    }
    if (userAge !== undefined) {
      context.userAge = userAge;
    }
    if (user?.gender) {
      context.userGender = user.gender;
    }

    return context;
  }

  /**
   * Build structured "Why Recommended" reasons
   */
  private buildWhyRecommended(context: ExplanationContext): ExplanationReason[] {
    const reasons: ExplanationReason[] = [];

    // Parse match reasons into structured format
    for (const reason of context.matchReasons) {
      const reasonLower = reason.toLowerCase();

      // Determine type based on content
      let type: ExplanationReason['type'] = 'eligibility';
      if (reasonLower.includes('goal') || reasonLower.includes('objective')) {
        type = 'goal_match';
      } else if (reasonLower.includes('symptom') || reasonLower.includes('condition')) {
        type = 'symptom_match';
      } else if (
        reasonLower.includes('biomarker') ||
        reasonLower.includes('blood') ||
        reasonLower.includes('level')
      ) {
        type = 'biomarker_match';
      } else if (
        reasonLower.includes('lifestyle') ||
        reasonLower.includes('exercise') ||
        reasonLower.includes('diet')
      ) {
        type = 'lifestyle_match';
      }

      // Determine confidence based on relevance score
      let confidence: ExplanationReason['confidence'] = 'medium';
      if (context.relevanceScore >= 0.8) {
        confidence = 'high';
      } else if (context.relevanceScore < 0.5) {
        confidence = 'low';
      }

      reasons.push({
        type,
        title: this.extractReasonTitle(reason),
        description: reason,
        confidence,
      });
    }

    // Ensure we have at least one reason
    if (reasons.length === 0) {
      reasons.push({
        type: 'eligibility',
        title: 'General Eligibility',
        description: `Based on your health profile, ${context.treatment.name} may be a suitable option to explore.`,
        confidence: 'medium',
      });
    }

    return reasons;
  }

  /**
   * Extract a short title from a longer reason
   */
  private extractReasonTitle(reason: string): string {
    // Try to extract first key phrase before colon or period
    const colonIndex = reason.indexOf(':');
    if (colonIndex > 0 && colonIndex < 50) {
      return reason.substring(0, colonIndex).trim();
    }

    const periodIndex = reason.indexOf('.');
    if (periodIndex > 0 && periodIndex < 50) {
      return reason.substring(0, periodIndex).trim();
    }

    // Truncate long reasons
    if (reason.length > 40) {
      return reason.substring(0, 37) + '...';
    }

    return reason;
  }

  /**
   * Build personalized factors from intake data
   */
  private buildPersonalizedFactors(context: ExplanationContext): PersonalizedFactor[] {
    const factors: PersonalizedFactor[] = [];

    if (!context.intakeData) {
      return factors;
    }

    const intake = context.intakeData;

    // Age factor
    if (context.userAge) {
      factors.push({
        factor: 'Age',
        impact: 'neutral',
        description: `Your age (${context.userAge}) is within the typical range for this treatment.`,
      });
    }

    // Lifestyle factors
    if (intake.lifestyle) {
      // Exercise
      if (
        intake.lifestyle.exerciseFrequency === 'active' ||
        intake.lifestyle.exerciseFrequency === 'very_active'
      ) {
        factors.push({
          factor: 'Active Lifestyle',
          impact: 'positive',
          description: 'Your active lifestyle may complement this treatment approach.',
        });
      }

      // Stress level
      if (intake.lifestyle.stressLevel === 'high') {
        factors.push({
          factor: 'Stress Level',
          impact: 'consideration',
          description: 'Managing stress alongside treatment may enhance results.',
        });
      }

      // Sleep
      if (intake.lifestyle.sleepHours < 6) {
        factors.push({
          factor: 'Sleep Quality',
          impact: 'consideration',
          description: 'Improving sleep may support treatment effectiveness.',
        });
      }
    }

    // Contraindications as consideration factors
    for (const contra of context.contraindications.slice(0, 2)) {
      factors.push({
        factor: 'Medical Consideration',
        impact: 'consideration',
        description: contra,
      });
    }

    return factors;
  }

  /**
   * Build biomarker insights from blood test results
   */
  private buildBiomarkerInsights(
    results: BloodTestResult[],
    treatmentName: string
  ): BiomarkerInsight[] {
    return results.slice(0, 5).map((result) => {
      let currentStatus: BiomarkerInsight['currentStatus'] = 'normal';
      if (result.isAbnormal) {
        if (result.referenceMin && result.value < result.referenceMin) {
          currentStatus = 'low';
        } else if (result.referenceMax && result.value > result.referenceMax) {
          currentStatus = 'high';
        } else {
          currentStatus = 'abnormal';
        }
      }

      const insight: BiomarkerInsight = {
        biomarkerCode: result.biomarkerCode,
        biomarkerName: this.formatBiomarkerName(result.biomarkerCode),
        relevance: `This biomarker is relevant to understanding how ${treatmentName} may affect your health.`,
        currentStatus,
      };
      if (result.isAbnormal) {
        insight.howTreatmentHelps = `${treatmentName} may help address factors related to this biomarker.`;
      }
      return insight;
    });
  }

  /**
   * Format biomarker code into readable name
   */
  private formatBiomarkerName(code: string): string {
    const nameMap: Record<string, string> = {
      TSH: 'Thyroid Stimulating Hormone',
      T3: 'Triiodothyronine',
      T4: 'Thyroxine',
      TESTOSTERONE_TOTAL: 'Total Testosterone',
      TESTOSTERONE_FREE: 'Free Testosterone',
      ESTRADIOL: 'Estradiol',
      CORTISOL: 'Cortisol',
      DHEA_S: 'DHEA-S',
      VITAMIN_D: 'Vitamin D',
      VITAMIN_B12: 'Vitamin B12',
      IRON: 'Iron',
      FERRITIN: 'Ferritin',
      HBA1C: 'HbA1c (Blood Sugar)',
      GLUCOSE: 'Blood Glucose',
      CHOLESTEROL_TOTAL: 'Total Cholesterol',
      HDL: 'HDL Cholesterol',
      LDL: 'LDL Cholesterol',
      TRIGLYCERIDES: 'Triglycerides',
      CRP: 'C-Reactive Protein',
      HOMOCYSTEINE: 'Homocysteine',
    };

    return nameMap[code] || code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Generate AI-powered "How It Works" explanation
   */
  private async generateHowItWorks(context: ExplanationContext): Promise<string> {
    try {
      const response = await anthropicService.generateExplanation(
        `How ${context.treatment.name} works`,
        {
          category: context.treatment.category,
          description: context.treatment.description,
        }
      );

      // Truncate if too long
      if (response.length > 500) {
        return response.substring(0, 497) + '...';
      }

      return response;
    } catch (error) {
      logger.error('Failed to generate howItWorks explanation', { error });
      // Fallback to generic explanation
      return `${context.treatment.name} is a treatment option in the ${context.treatment.category.replace(/_/g, ' ').toLowerCase()} category. Please consult with a healthcare provider for detailed information about how this treatment works and whether it may be suitable for you.`;
    }
  }

  /**
   * Generate evidence support statements
   */
  private async generateEvidenceSupport(context: ExplanationContext): Promise<string[]> {
    // For now, return general evidence statements
    // In production, this could pull from a medical evidence database
    const categoryEvidence: Record<string, string[]> = {
      HORMONE_THERAPY: [
        'Hormone optimization has been studied in clinical settings for various health applications.',
        'Treatment protocols are typically based on established medical guidelines.',
        'Regular monitoring helps ensure treatment remains appropriate for individual needs.',
      ],
      WEIGHT_MANAGEMENT: [
        'Evidence-based weight management approaches combine multiple strategies.',
        'Medical interventions are typically most effective when combined with lifestyle modifications.',
        'Individual responses to weight management treatments can vary significantly.',
      ],
      MENTAL_HEALTH: [
        'Mental health treatments are backed by extensive clinical research.',
        'Personalized approaches tend to show better long-term outcomes.',
        'Regular evaluation helps optimize treatment effectiveness.',
      ],
      GENERAL_WELLNESS: [
        'Wellness approaches focus on optimizing overall health and quality of life.',
        'Preventive strategies can support long-term health outcomes.',
        'Individual results depend on multiple factors including lifestyle and genetics.',
      ],
    };

    const evidence = categoryEvidence[context.treatment.category];
    if (evidence !== undefined) {
      return evidence;
    }
    // Fallback to general wellness (always defined)
    return [
      'Wellness approaches focus on optimizing overall health and quality of life.',
      'Preventive strategies can support long-term health outcomes.',
      'Individual results depend on multiple factors including lifestyle and genetics.',
    ];
  }

  /**
   * Build limitations list
   */
  private buildLimitations(context: ExplanationContext): string[] {
    const limitations: string[] = [
      'Results may vary based on individual health factors.',
      'This treatment may not be suitable for everyone.',
    ];

    if (context.treatment.requiresBloodTest) {
      limitations.push('Blood testing is required before starting this treatment.');
    }

    if (context.contraindications.length > 0) {
      limitations.push('There may be specific considerations based on your health profile.');
    }

    if (!context.isEligible) {
      limitations.push(
        'Based on current information, additional evaluation may be needed before proceeding.'
      );
    }

    return limitations;
  }

  /**
   * Find related treatment alternatives
   */
  private async findRelatedAlternatives(
    recommendationId: string,
    currentTreatmentId: string,
    category: string
  ): Promise<RelatedTreatment[]> {
    const alternatives = await prisma.treatmentMatch.findMany({
      where: {
        recommendationId,
        treatmentId: { not: currentTreatmentId },
        treatment: { category: category as never },
        isEligible: true,
      },
      include: {
        treatment: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { relevanceScore: 'desc' },
      take: 3,
    });

    return alternatives.map((alt) => ({
      treatmentId: alt.treatment.id,
      treatmentName: alt.treatment.name,
      differentiator:
        alt.treatment.description?.substring(0, 100) || 'Alternative option in this category.',
    }));
  }
}

// ============================================
// Singleton Instance
// ============================================
export const explanationService = new ExplanationService();
export default explanationService;
