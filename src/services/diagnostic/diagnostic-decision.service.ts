import { prisma } from '../../utils/database.js';
import logger from '../../utils/logger.js';
import type { HealthIntakeData, HealthGoal } from '../../types/index.js';

// ============================================
// Types
// ============================================

export interface DiagnosticDecision {
  requiresBloodTest: boolean;
  recommendedPanelType: 'targeted' | 'goal-based' | 'comprehensive' | null;
  requiredBiomarkers: string[];
  optionalBiomarkers: string[];
  reasoning: string[];
}

interface BiomarkerRequirement {
  code: string;
  isRequired: boolean;
  forGoals: string[];
}

// ============================================
// Service Interface
// ============================================

export interface IDiagnosticDecisionService {
  evaluateDiagnosticNeeds(
    intakeData: HealthIntakeData,
    userAge?: number
  ): Promise<DiagnosticDecision>;
  getMinimumViablPanel(biomarkers: string[]): 'targeted' | 'goal-based' | 'comprehensive';
}

// ============================================
// Service Implementation
// ============================================

/**
 * Diagnostic Decision Engine
 * Determines whether blood testing is required, which biomarkers are relevant,
 * and the minimum viable diagnostic panel.
 *
 * Note: This is for routing/eligibility purposes only - NOT diagnostic.
 */
export class DiagnosticDecisionService implements IDiagnosticDecisionService {
  // Biomarker mapping based on health goals
  private readonly goalToBiomarkers: Record<string, BiomarkerRequirement[]> = {
    hormone_optimization: [
      {
        code: 'TESTOSTERONE_TOTAL',
        isRequired: true,
        forGoals: ['hormone_optimization', 'sexual_health', 'energy'],
      },
      { code: 'TESTOSTERONE_FREE', isRequired: false, forGoals: ['hormone_optimization'] },
      { code: 'ESTRADIOL', isRequired: false, forGoals: ['hormone_optimization'] },
      { code: 'SHBG', isRequired: false, forGoals: ['hormone_optimization'] },
      { code: 'LH', isRequired: false, forGoals: ['hormone_optimization'] },
      { code: 'FSH', isRequired: false, forGoals: ['hormone_optimization'] },
    ],
    thyroid_health: [
      { code: 'TSH', isRequired: true, forGoals: ['thyroid_health', 'energy', 'weight'] },
      { code: 'T4_FREE', isRequired: true, forGoals: ['thyroid_health'] },
      { code: 'T3_FREE', isRequired: false, forGoals: ['thyroid_health'] },
    ],
    weight_management: [
      { code: 'HBA1C', isRequired: true, forGoals: ['weight_management', 'metabolic'] },
      { code: 'FASTING_GLUCOSE', isRequired: true, forGoals: ['weight_management'] },
      { code: 'FASTING_INSULIN', isRequired: false, forGoals: ['weight_management'] },
      { code: 'LIPID_PANEL', isRequired: true, forGoals: ['weight_management', 'cardiovascular'] },
      { code: 'TSH', isRequired: false, forGoals: ['weight_management'] },
    ],
    energy_fatigue: [
      { code: 'FERRITIN', isRequired: true, forGoals: ['energy_fatigue'] },
      { code: 'VIT_B12', isRequired: true, forGoals: ['energy_fatigue'] },
      { code: 'VIT_D', isRequired: true, forGoals: ['energy_fatigue', 'general_wellness'] },
      { code: 'TSH', isRequired: true, forGoals: ['energy_fatigue'] },
      { code: 'CBC', isRequired: true, forGoals: ['energy_fatigue'] },
    ],
    mental_health: [
      { code: 'VIT_D', isRequired: true, forGoals: ['mental_health'] },
      { code: 'VIT_B12', isRequired: true, forGoals: ['mental_health'] },
      { code: 'TSH', isRequired: false, forGoals: ['mental_health'] },
      { code: 'CORTISOL', isRequired: false, forGoals: ['mental_health', 'stress'] },
    ],
    sexual_health: [
      { code: 'TESTOSTERONE_TOTAL', isRequired: true, forGoals: ['sexual_health'] },
      { code: 'ESTRADIOL', isRequired: false, forGoals: ['sexual_health'] },
      { code: 'PROLACTIN', isRequired: false, forGoals: ['sexual_health'] },
    ],
    sleep_optimization: [
      { code: 'CORTISOL', isRequired: false, forGoals: ['sleep_optimization'] },
      { code: 'VIT_D', isRequired: true, forGoals: ['sleep_optimization'] },
      { code: 'MAGNESIUM', isRequired: false, forGoals: ['sleep_optimization'] },
    ],
    longevity: [
      { code: 'HBA1C', isRequired: true, forGoals: ['longevity'] },
      { code: 'LIPID_PANEL', isRequired: true, forGoals: ['longevity'] },
      { code: 'HS_CRP', isRequired: true, forGoals: ['longevity'] },
      { code: 'VIT_D', isRequired: true, forGoals: ['longevity'] },
      { code: 'CBC', isRequired: true, forGoals: ['longevity'] },
    ],
    general_wellness: [
      { code: 'CBC', isRequired: true, forGoals: ['general_wellness'] },
      { code: 'VIT_D', isRequired: true, forGoals: ['general_wellness'] },
      { code: 'LIPID_PANEL', isRequired: false, forGoals: ['general_wellness'] },
    ],
  };

  // Conditions that strongly suggest blood testing
  private readonly conditionsRequiringBloodwork = [
    'diabetes',
    'thyroid_disorder',
    'cardiovascular_disease',
    'anemia',
    'hormone_imbalance',
    'chronic_fatigue',
    'obesity',
  ];

  /**
   * Evaluate diagnostic needs based on health intake data
   */
  async evaluateDiagnosticNeeds(
    intakeData: HealthIntakeData,
    userAge?: number
  ): Promise<DiagnosticDecision> {
    const reasoning: string[] = [];
    const requiredBiomarkers = new Set<string>();
    const optionalBiomarkers = new Set<string>();

    // 1. Check goals
    const goals = intakeData.goals || [];
    for (const goal of goals) {
      const goalKey = this.normalizeGoalCategory(goal.category);
      const biomarkers = this.goalToBiomarkers[goalKey];

      if (biomarkers) {
        reasoning.push(`Goal "${goal.category}" suggests relevant biomarkers`);
        for (const bm of biomarkers) {
          if (bm.isRequired || goal.priority === 'high') {
            requiredBiomarkers.add(bm.code);
          } else {
            optionalBiomarkers.add(bm.code);
          }
        }
      }
    }

    // 2. Check medical conditions
    const conditions = intakeData.medicalHistory?.conditions || [];
    for (const condition of conditions) {
      const normalizedCondition = condition.toLowerCase().replace(/\s+/g, '_');
      if (this.conditionsRequiringBloodwork.some((c) => normalizedCondition.includes(c))) {
        reasoning.push(`Condition "${condition}" suggests blood testing is beneficial`);
        // Add common biomarkers for chronic conditions
        requiredBiomarkers.add('CBC');
        requiredBiomarkers.add('HBA1C');
      }
    }

    // 3. Age-based recommendations
    if (userAge) {
      if (userAge >= 40) {
        reasoning.push('Age 40+ suggests comprehensive metabolic panel');
        requiredBiomarkers.add('LIPID_PANEL');
        requiredBiomarkers.add('HBA1C');
        optionalBiomarkers.add('PSA'); // For males
      }
      if (userAge >= 50) {
        requiredBiomarkers.add('VIT_D');
        requiredBiomarkers.add('VIT_B12');
      }
    }

    // 4. Check symptoms severity
    const severeSymptoms = (intakeData.symptoms || []).filter((s) => s.severity === 'severe');
    if (severeSymptoms.length > 0) {
      reasoning.push(`${severeSymptoms.length} severe symptom(s) suggest blood testing`);
      // Add baseline panel for severe symptoms
      requiredBiomarkers.add('CBC');
    }

    // 5. Check if currently on medications that require monitoring
    const medications = intakeData.medicalHistory?.currentMedications || [];
    if (medications.length > 0) {
      reasoning.push('Current medications may require baseline blood work');
    }

    // 6. Query treatments that might be relevant and get their required biomarkers
    const treatmentBiomarkers = await this.getTreatmentRequiredBiomarkers(goals);
    for (const code of treatmentBiomarkers) {
      requiredBiomarkers.add(code);
      reasoning.push(`Treatment eligibility requires biomarker: ${code}`);
    }

    // Remove optional biomarkers that are already required
    for (const code of requiredBiomarkers) {
      optionalBiomarkers.delete(code);
    }

    // Determine if blood test is required
    const requiresBloodTest = requiredBiomarkers.size > 0;

    // Determine panel type
    let recommendedPanelType: DiagnosticDecision['recommendedPanelType'] = null;
    if (requiresBloodTest) {
      recommendedPanelType = this.getMinimumViablPanel([...requiredBiomarkers]);
    }

    logger.info('Diagnostic decision evaluated', {
      requiresBloodTest,
      recommendedPanelType,
      requiredCount: requiredBiomarkers.size,
      optionalCount: optionalBiomarkers.size,
    });

    return {
      requiresBloodTest,
      recommendedPanelType,
      requiredBiomarkers: [...requiredBiomarkers],
      optionalBiomarkers: [...optionalBiomarkers],
      reasoning,
    };
  }

  /**
   * Determine the minimum viable panel that covers all required biomarkers
   */
  getMinimumViablPanel(biomarkers: string[]): 'targeted' | 'goal-based' | 'comprehensive' {
    const count = biomarkers.length;

    // Panel definitions (should match BloodTestService)
    const panels = {
      targeted: ['TSH', 'VIT_D', 'TESTOSTERONE_TOTAL'],
      'goal-based': ['TSH', 'T4_FREE', 'T3_FREE', 'CORTISOL', 'TESTOSTERONE_TOTAL'],
      comprehensive: [
        'TSH',
        'T4_FREE',
        'TESTOSTERONE_TOTAL',
        'LIPID_PANEL',
        'CBC',
        'HBA1C',
        'VIT_D',
        'VIT_B12',
        'FERRITIN',
      ],
    };

    // Check if targeted panel covers requirements
    const targetedCovers = biomarkers.every((bm) => panels.targeted.includes(bm));
    if (targetedCovers && count <= panels.targeted.length) {
      return 'targeted';
    }

    // Check if goal-based panel covers requirements
    const goalBasedCovers = biomarkers.every(
      (bm) => panels['goal-based'].includes(bm) || panels.targeted.includes(bm)
    );
    if (goalBasedCovers && count <= panels['goal-based'].length) {
      return 'goal-based';
    }

    // Default to comprehensive
    return 'comprehensive';
  }

  /**
   * Normalize goal category string to match our mapping
   */
  private normalizeGoalCategory(category: string): string {
    return category.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  }

  /**
   * Get biomarkers required by potential treatments based on user goals
   */
  private async getTreatmentRequiredBiomarkers(goals: HealthGoal[]): Promise<string[]> {
    const goalCategories = goals.map((g) => g.category.toUpperCase().replace(/\s+/g, '_'));

    // Find treatments matching these goals
    const treatments = await prisma.treatment.findMany({
      where: {
        isActive: true,
        requiresBloodTest: true,
        category: {
          in: goalCategories as (
            | 'HORMONE_THERAPY'
            | 'WEIGHT_MANAGEMENT'
            | 'SEXUAL_HEALTH'
            | 'MENTAL_HEALTH'
            | 'LONGEVITY'
            | 'SKIN_HEALTH'
            | 'HAIR_HEALTH'
            | 'SLEEP_OPTIMIZATION'
            | 'COGNITIVE_ENHANCEMENT'
            | 'GENERAL_WELLNESS'
          )[],
        },
      },
      include: {
        treatmentBiomarkers: {
          where: { isRequired: true },
          include: { biomarker: true },
        },
      },
    });

    const biomarkerCodes: string[] = [];
    for (const treatment of treatments) {
      for (const tb of treatment.treatmentBiomarkers) {
        if (!biomarkerCodes.includes(tb.biomarker.code)) {
          biomarkerCodes.push(tb.biomarker.code);
        }
      }
    }

    return biomarkerCodes;
  }
}

export const diagnosticDecisionService = new DiagnosticDecisionService();
export default diagnosticDecisionService;
