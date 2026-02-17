import { Treatment, MatchingRule, MatchingRuleOperator, User } from '@prisma/client';
import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import type { HealthIntakeData, BloodTestResult } from '../../types/index.js';

// ============================================
// Types
// ============================================

export interface MatchContext {
  user: User;
  intake: HealthIntakeData;
  bloodTests?: BloodTestResult[];
}

export interface ScoredTreatment {
  treatment: Treatment;
  score: number;
  matchReasons: string[];
  isEligible: boolean;
  contraindications: string[]; // Reasons why it's NOT eligible
}

// ============================================
// Matching Service Interface
// ============================================

export interface IMatchingService {
  findMatches(context: MatchContext): Promise<ScoredTreatment[]>;
  evaluateRule(rule: MatchingRule, context: MatchContext): boolean;
}

// ============================================
// Matching Service Implementation
// ============================================

export class MatchingService implements IMatchingService {
  /**
   * Find matching treatments for a user based on their data
   */
  async findMatches(context: MatchContext): Promise<ScoredTreatment[]> {
    logger.info('Starting treatment matching', { userId: context.user.id });

    // 1. Fetch all active treatments with their rules
    const treatments = await prisma.treatment.findMany({
      where: { isActive: true },
      include: {
        matchingRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
        treatmentBiomarkers: true,
      },
    });

    const results: ScoredTreatment[] = [];

    // 2. Evaluate each treatment
    for (const treatment of treatments) {
      const result = this.evaluateTreatment(treatment, context);

      // Only include relevant matches (score > 0 OR manually forced inclusion)
      // If it's eligible, or if it's ineligible but has a high relevance (might be useful to show "why not")
      if (result.score > 0 || result.matchReasons.length > 0) {
        results.push(result);
      }
    }

    // 3. Sort by score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Evaluate a single treatment against the context
   */
  private evaluateTreatment(
    treatment: Treatment & { matchingRules: MatchingRule[] },
    context: MatchContext
  ): ScoredTreatment {
    let score = 0;
    const matchReasons: string[] = [];
    const contraindications: string[] = [];
    let isEligible = true;

    // Check hard eligibility constraints (db schema constraints)
    // Age check
    if (context.user.dateOfBirth) {
      const age = this.calculateAge(context.user.dateOfBirth);
      if (treatment.minAge && age < treatment.minAge) {
        isEligible = false;
        contraindications.push(`Age ${age} is below minimum ${treatment.minAge}`);
      }
      if (treatment.maxAge && age > treatment.maxAge) {
        isEligible = false;
        contraindications.push(`Age ${age} is above maximum ${treatment.maxAge}`);
      }
    }

    // Gender check
    if (treatment.allowedGenders.length > 0 && context.user.gender) {
      if (!treatment.allowedGenders.includes(context.user.gender)) {
        isEligible = false;
        contraindications.push(`Gender ${context.user.gender} not eligible`);
      }
    }

    // Evaluate Rules
    for (const rule of treatment.matchingRules) {
      const isMatch = this.evaluateRule(rule, context);

      if (isMatch) {
        // Add weight to score
        score += Number(rule.weight);
        matchReasons.push(rule.description || `Matches ${rule.field}`);
      } else if (rule.isRequired) {
        // If a required rule fails, the treatment is ineligible
        isEligible = false;
        contraindications.push(`Failed requirement: ${rule.description || rule.field}`);
      }
    }

    // Normalize score between 0 and 1 (simplified logic)
    // Assuming max possible score is sum of all positive weights, but here we just cap at 1.0 for now
    // or keep raw score. The schema defines relevanceScore as Decimal(5,4) which is 0.0000 to 1.0000 probably?
    // Wait, schema says Decimal(5,4), which means 1 integer digit and 4 decimals. max 9.9999.
    // Let's cap at 1.0 for consistency if that's the intention, or allow up to 10.
    // Let's just return the raw score for now, but cap at 1.0 for the interface if needed.
    const normalizedScore = Math.min(Math.max(score, 0), 1);

    return {
      treatment,
      score: normalizedScore,
      matchReasons,
      isEligible: isEligible && normalizedScore > 0, // Must match at least something? Or rules dictate.
      contraindications,
    };
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule: MatchingRule, context: MatchContext): boolean {
    const actualValue = this.extractValue(rule.field, context);
    const targetValue = this.parseValue(rule.value);

    if (actualValue === undefined || actualValue === null) {
      return rule.operator === MatchingRuleOperator.IS_NULL;
    }

    switch (rule.operator) {
      case MatchingRuleOperator.EQUALS:
        return actualValue === targetValue;
      case MatchingRuleOperator.NOT_EQUALS:
        return actualValue !== targetValue;
      case MatchingRuleOperator.GREATER_THAN:
        return Number(actualValue) > Number(targetValue);
      case MatchingRuleOperator.LESS_THAN:
        return Number(actualValue) < Number(targetValue);
      case MatchingRuleOperator.GREATER_THAN_OR_EQUALS:
        return Number(actualValue) >= Number(targetValue);
      case MatchingRuleOperator.LESS_THAN_OR_EQUALS:
        return Number(actualValue) <= Number(targetValue);
      case MatchingRuleOperator.CONTAINS:
        return String(actualValue).toLowerCase().includes(String(targetValue).toLowerCase());
      case MatchingRuleOperator.NOT_CONTAINS:
        return !String(actualValue).toLowerCase().includes(String(targetValue).toLowerCase());
      case MatchingRuleOperator.IN:
        return Array.isArray(targetValue) && targetValue.includes(actualValue); // simplistic
      case MatchingRuleOperator.IS_NULL:
        return actualValue === null || actualValue === undefined;
      case MatchingRuleOperator.IS_NOT_NULL:
        return actualValue !== null && actualValue !== undefined;
      default:
        return false;
    }
  }

  /**
   * Extract value from context using dot notation
   * e.g., "user.gender", "intake.medicalHistory.conditions", "blood.TSH"
   */
  private extractValue(path: string, context: MatchContext): unknown {
    const [domain, ...parts] = path.split('.');

    if (domain === 'user') {
      return this.getNestedValue(context.user, parts);
    } else if (domain === 'intake') {
      // Flatten some intake arrays for easier querying?
      // Or assume standard structure.
      return this.getNestedValue(context.intake, parts);
    } else if (domain === 'blood') {
      // Special handling for blood tests: "blood.TSH" -> find result with code TSH
      const biomarkerCode = parts[0];
      const result = context.bloodTests?.find((r) => r.biomarkerCode === biomarkerCode);
      return result ? result.value : undefined;
    }

    return undefined;
  }

  private getNestedValue(obj: unknown, parts: string[]): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = obj;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  private parseValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
}

// ============================================
// Singleton Instance
// ============================================
export const matchingService = new MatchingService();
export default matchingService;
