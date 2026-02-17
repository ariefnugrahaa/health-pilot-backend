import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import type { HealthIntakeData, Gender } from '../../types/index.js';

// ============================================
// Prisma Client Type Workaround
// ============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = any;

// ============================================
// Types
// ============================================

/**
 * Supplement category values matching Prisma enum
 */
export type SupplementCategory =
  | 'VITAMIN'
  | 'MINERAL'
  | 'HERB'
  | 'AMINO_ACID'
  | 'PROBIOTIC'
  | 'OMEGA'
  | 'ENZYME'
  | 'ADAPTOGEN'
  | 'LIFESTYLE_CHANGE'
  | 'OTHER';

/**
 * Supplement data structure
 */
export interface Supplement {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: SupplementCategory;
  evidenceLevel: string | null;
  primaryBenefits: string[];
  recommendedDosage: string | null;
  dosageUnit: string | null;
  frequency: string | null;
  targetSymptoms: string[];
  targetGoals: string[];
  targetBiomarkers: string[];
  minAge: number | null;
  maxAge: number | null;
  allowedGenders: Gender[];
  contraindications: string[];
  interactions: string[];
  sideEffects: string[];
  safetyNotes: string | null;
  affiliateLinks: Record<string, string> | null;
  averagePrice: number | null;
  currency: string;
  isActive: boolean;
}

/**
 * Supplement match result
 */
export interface SupplementMatchResult {
  supplement: Supplement;
  matchScore: number;
  matchReason: string;
  personalizedDosage: string | null;
  expectedBenefit: string | null;
  priority: number;
}

/**
 * Input for finding supplement matches
 */
export interface SupplementMatchInput {
  userAge: number | null;
  userGender: Gender | null;
  symptoms: string[];
  goals: string[];
  biomarkerCodes?: string[];
  medications?: string[];
  conditions?: string[];
  maxResults?: number;
}

// ============================================
// Interface
// ============================================

export interface ISupplementService {
  /**
   * Find supplements matching user's health profile
   */
  findMatchingSupplements(input: SupplementMatchInput): Promise<SupplementMatchResult[]>;

  /**
   * Get supplement by ID
   */
  getSupplementById(id: string): Promise<Supplement | null>;

  /**
   * Get supplement by slug
   */
  getSupplementBySlug(slug: string): Promise<Supplement | null>;

  /**
   * Create supplement matches for a recommendation
   */
  createSupplementMatches(
    recommendationId: string,
    matches: SupplementMatchResult[]
  ): Promise<void>;

  /**
   * Get supplements by category
   */
  getSupplementsByCategory(category: SupplementCategory): Promise<Supplement[]>;

  /**
   * Record affiliate click
   */
  recordAffiliateClick(matchId: string): Promise<void>;

  /**
   * Record purchase
   */
  recordPurchase(matchId: string): Promise<void>;

  /**
   * Get supplement recommendations for intake
   */
  getSupplementRecommendationsForIntake(
    intakeData: HealthIntakeData,
    userAge: number | null,
    userGender: Gender | null
  ): Promise<SupplementMatchResult[]>;
}

// ============================================
// Service Implementation
// ============================================

export class SupplementService implements ISupplementService {
  /**
   * Find supplements matching user's health profile
   */
  async findMatchingSupplements(input: SupplementMatchInput): Promise<SupplementMatchResult[]> {
    const {
      userAge,
      userGender,
      symptoms,
      goals,
      biomarkerCodes = [],
      medications = [],
      conditions = [],
      maxResults = 10,
    } = input;

    try {
      // Get all active supplements
      const supplements = (await (prisma as PrismaAny).supplement.findMany({
        where: { isActive: true },
      })) as Supplement[];

      // Score each supplement
      const scoredSupplements = supplements
        .map((supplement: Supplement) => {
          const scoreResult = this.calculateSupplementScore(
            supplement,
            userAge,
            userGender,
            symptoms,
            goals,
            biomarkerCodes,
            medications,
            conditions
          );
          return {
            supplement,
            ...scoreResult,
          };
        })
        .filter((result) => result.matchScore > 0) // Only include matches
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, maxResults);

      // Convert to SupplementMatchResult
      return scoredSupplements.map((result, index) => ({
        supplement: result.supplement,
        matchScore: result.matchScore,
        matchReason: result.matchReason,
        personalizedDosage: this.getPersonalizedDosage(result.supplement, userAge, userGender),
        expectedBenefit: result.expectedBenefit,
        priority: index + 1,
      }));
    } catch (error) {
      logger.error('Failed to find matching supplements', { error });
      throw error;
    }
  }

  /**
   * Calculate match score for a supplement
   */
  private calculateSupplementScore(
    supplement: Supplement,
    userAge: number | null,
    userGender: Gender | null,
    symptoms: string[],
    goals: string[],
    biomarkerCodes: string[],
    medications: string[],
    conditions: string[]
  ): { matchScore: number; matchReason: string; expectedBenefit: string } {
    let score = 0;
    const reasons: string[] = [];
    const benefits: string[] = [];

    // Check eligibility first
    if (!this.isEligible(supplement, userAge, userGender, medications, conditions)) {
      return { matchScore: 0, matchReason: 'Not eligible', expectedBenefit: '' };
    }

    // Score based on symptom match
    const symptomMatches = symptoms.filter((symptom) =>
      supplement.targetSymptoms.some((target) =>
        target.toLowerCase().includes(symptom.toLowerCase())
      )
    );
    if (symptomMatches.length > 0) {
      score += symptomMatches.length * 20;
      reasons.push(`Addresses symptoms: ${symptomMatches.join(', ')}`);
    }

    // Score based on goal match
    const goalMatches = goals.filter((goal) =>
      supplement.targetGoals.some((target) => target.toLowerCase().includes(goal.toLowerCase()))
    );
    if (goalMatches.length > 0) {
      score += goalMatches.length * 25;
      reasons.push(`Aligns with goals: ${goalMatches.join(', ')}`);
    }

    // Score based on biomarker targeting
    const biomarkerMatches = biomarkerCodes.filter((code) =>
      supplement.targetBiomarkers.includes(code)
    );
    if (biomarkerMatches.length > 0) {
      score += biomarkerMatches.length * 30;
      reasons.push(`Targets biomarkers: ${biomarkerMatches.join(', ')}`);
    }

    // Bonus for strong evidence
    if (supplement.evidenceLevel === 'strong') {
      score += 15;
      reasons.push('Strong scientific evidence');
    } else if (supplement.evidenceLevel === 'moderate') {
      score += 10;
    }

    // Add primary benefits
    benefits.push(...supplement.primaryBenefits.slice(0, 3));

    // Cap score at 100
    score = Math.min(score, 100);

    return {
      matchScore: score,
      matchReason: reasons.join('. '),
      expectedBenefit: benefits.join('. '),
    };
  }

  /**
   * Check if user is eligible for supplement
   */
  private isEligible(
    supplement: Supplement,
    userAge: number | null,
    userGender: Gender | null,
    medications: string[],
    conditions: string[]
  ): boolean {
    // Check age eligibility
    if (userAge !== null) {
      if (supplement.minAge && userAge < supplement.minAge) {
        return false;
      }
      if (supplement.maxAge && userAge > supplement.maxAge) {
        return false;
      }
    }

    // Check gender eligibility
    if (userGender && supplement.allowedGenders.length > 0) {
      if (!supplement.allowedGenders.includes(userGender)) {
        return false;
      }
    }

    // Check contraindications
    for (const condition of conditions) {
      if (
        supplement.contraindications.some((contra) =>
          contra.toLowerCase().includes(condition.toLowerCase())
        )
      ) {
        return false;
      }
    }

    // Check interactions with medications
    for (const medication of medications) {
      if (
        supplement.interactions.some((interaction) =>
          interaction.toLowerCase().includes(medication.toLowerCase())
        )
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get personalized dosage recommendation
   */
  private getPersonalizedDosage(
    supplement: Supplement,
    userAge: number | null,
    _userGender: Gender | null
  ): string | null {
    if (!supplement.recommendedDosage) {
      return null;
    }

    let dosage = supplement.recommendedDosage;
    const unit = supplement.dosageUnit || '';
    const frequency = supplement.frequency || 'daily';

    // Adjust for age (elderly may need lower dose)
    if (userAge !== null && userAge >= 65) {
      dosage = `${dosage} (consider starting with lower dose)`;
    }

    return `${dosage} ${unit} ${frequency}`.trim();
  }

  /**
   * Get supplement by ID
   */
  async getSupplementById(id: string): Promise<Supplement | null> {
    try {
      const supplement = await (prisma as PrismaAny).supplement.findUnique({
        where: { id },
      });
      return supplement as Supplement | null;
    } catch (error) {
      logger.error('Failed to get supplement by ID', { id, error });
      throw error;
    }
  }

  /**
   * Get supplement by slug
   */
  async getSupplementBySlug(slug: string): Promise<Supplement | null> {
    try {
      const supplement = await (prisma as PrismaAny).supplement.findUnique({
        where: { slug },
      });
      return supplement as Supplement | null;
    } catch (error) {
      logger.error('Failed to get supplement by slug', { slug, error });
      throw error;
    }
  }

  /**
   * Create supplement matches for a recommendation
   */
  async createSupplementMatches(
    recommendationId: string,
    matches: SupplementMatchResult[]
  ): Promise<void> {
    try {
      const matchData = matches.map((match) => ({
        recommendationId,
        supplementId: match.supplement.id,
        matchScore: match.matchScore,
        matchReason: match.matchReason,
        priority: match.priority,
        personalizedDosage: match.personalizedDosage,
        expectedBenefit: match.expectedBenefit,
      }));

      await (prisma as PrismaAny).supplementMatch.createMany({
        data: matchData,
        skipDuplicates: true,
      });

      logger.info('Created supplement matches', {
        recommendationId,
        count: matches.length,
      });
    } catch (error) {
      logger.error('Failed to create supplement matches', {
        recommendationId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get supplements by category
   */
  async getSupplementsByCategory(category: SupplementCategory): Promise<Supplement[]> {
    try {
      const supplements = await (prisma as PrismaAny).supplement.findMany({
        where: {
          category,
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
      return supplements as Supplement[];
    } catch (error) {
      logger.error('Failed to get supplements by category', { category, error });
      throw error;
    }
  }

  /**
   * Record affiliate click
   */
  async recordAffiliateClick(matchId: string): Promise<void> {
    try {
      await (prisma as PrismaAny).supplementMatch.update({
        where: { id: matchId },
        data: {
          affiliateClicked: true,
          viewedAt: new Date(),
        },
      });

      logger.info('Recorded affiliate click', { matchId });
    } catch (error) {
      logger.error('Failed to record affiliate click', { matchId, error });
      throw error;
    }
  }

  /**
   * Record purchase
   */
  async recordPurchase(matchId: string): Promise<void> {
    try {
      await (prisma as PrismaAny).supplementMatch.update({
        where: { id: matchId },
        data: {
          status: 'PURCHASED',
          purchasedAt: new Date(),
        },
      });

      logger.info('Recorded purchase', { matchId });
    } catch (error) {
      logger.error('Failed to record purchase', { matchId, error });
      throw error;
    }
  }

  /**
   * Get supplement recommendations for intake data
   */
  async getSupplementRecommendationsForIntake(
    intakeData: HealthIntakeData,
    userAge: number | null,
    userGender: Gender | null
  ): Promise<SupplementMatchResult[]> {
    // Extract symptoms
    const symptoms = intakeData.symptoms?.map((s) => s.name) ?? [];

    // Extract goals
    const goals = intakeData.goals?.map((g) => g.category) ?? [];

    // Extract conditions from medical history
    const conditions = intakeData.medicalHistory?.conditions ?? [];

    // Extract medications (from currentMedications array, getting just names)
    const medications = intakeData.medicalHistory?.currentMedications?.map((m) => m.name) ?? [];

    return this.findMatchingSupplements({
      userAge,
      userGender,
      symptoms,
      goals,
      conditions,
      medications,
      maxResults: 5, // Top 5 supplements
    });
  }
}

// Export singleton instance
export const supplementService = new SupplementService();
