import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../api/middlewares/error.middleware.js';

// ============================================
// Types
// ============================================

export interface BiomarkerFinding {
  biomarkerCode: string;
  biomarkerName: string;
  value: number;
  unit: string;
  status: 'OPTIMAL' | 'NORMAL' | 'SUBOPTIMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
  interpretation: string;
  clinicalSignificance: string;
  potentialCauses?: string[];
  relatedBiomarkers?: string[];
}

export interface ActionableRecommendation {
  category: 'LIFESTYLE' | 'NUTRITION' | 'SUPPLEMENT' | 'FOLLOW_UP' | 'URGENT';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  description: string;
  rationale: string;
  relatedBiomarkers: string[];
  timeframe?: string;
}

export interface BloodTestInterpretationResult {
  summary: string;
  overallHealthScore: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_ATTENTION' | 'CONCERNING';
  keyFindings: BiomarkerFinding[];
  recommendations: ActionableRecommendation[];
  riskFactors: string[];
  positiveIndicators: string[];
  followUpSuggestions: string[];
  disclaimer: string;
  tokensUsed: number;
  modelVersion: string;
}

// ============================================
// Service Interface
// ============================================

export interface IBloodTestInterpretationService {
  interpretBloodTest(testId: string, userId: string): Promise<BloodTestInterpretationResult>;
  getInterpretation(testId: string, userId: string): Promise<BloodTestInterpretationResult | null>;
  regenerateInterpretation(testId: string, userId: string): Promise<BloodTestInterpretationResult>;
}

// ============================================
// Service Implementation
// ============================================

export class BloodTestInterpretationService implements IBloodTestInterpretationService {
  private client: Anthropic;
  private readonly model: string;
  private readonly promptVersion = '1.0.0';

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
    this.model = config.anthropic.model;
  }

  /**
   * Generate AI interpretation for blood test results
   */
  async interpretBloodTest(testId: string, userId: string): Promise<BloodTestInterpretationResult> {
    logger.info('Generating blood test interpretation', { testId, userId });

    // 1. Fetch test with results
    const test = await prisma.bloodTest.findUnique({
      where: { id: testId, userId },
      include: {
        biomarkerResults: {
          include: { biomarker: true },
        },
        user: {
          select: {
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundError('Blood test');
    }

    if (test.status !== 'COMPLETED' || test.biomarkerResults.length === 0) {
      throw new Error('Blood test results not available');
    }

    // 2. Check for existing interpretation
    const existing = await prisma.bloodTestInterpretation.findUnique({
      where: { bloodTestId: testId },
    });

    if (existing) {
      return this.decryptInterpretation(existing);
    }

    // 3. Prepare data for AI
    const biomarkerData: Array<{
      code: string;
      name: string;
      value: number;
      unit: string;
      referenceMin?: number;
      referenceMax?: number;
      isAbnormal: boolean;
      category: string;
    }> = test.biomarkerResults.map((r) => {
      const data: {
        code: string;
        name: string;
        value: number;
        unit: string;
        referenceMin?: number;
        referenceMax?: number;
        isAbnormal: boolean;
        category: string;
      } = {
        code: r.biomarker.code,
        name: r.biomarker.name,
        value: Number(r.value),
        unit: r.unit,
        isAbnormal: r.isAbnormal,
        category: r.biomarker.category,
      };
      if (r.referenceMin) {
        data.referenceMin = Number(r.referenceMin);
      }
      if (r.referenceMax) {
        data.referenceMax = Number(r.referenceMax);
      }
      return data;
    });

    const userContext: { age?: number; gender?: string | null } = {
      gender: test.user.gender,
    };
    if (test.user.dateOfBirth) {
      userContext.age = this.calculateAge(test.user.dateOfBirth);
    }

    // 4. Call AI for interpretation
    const interpretation = await this.generateInterpretation(biomarkerData, userContext);

    // 5. Store encrypted interpretation
    await prisma.bloodTestInterpretation.create({
      data: {
        bloodTestId: testId,
        summaryEncrypted: encryptionService.encrypt(interpretation.summary),
        findingsEncrypted: encryptionService.encrypt(JSON.stringify(interpretation.keyFindings)),
        actionsEncrypted: encryptionService.encrypt(
          JSON.stringify({
            recommendations: interpretation.recommendations,
            riskFactors: interpretation.riskFactors,
            positiveIndicators: interpretation.positiveIndicators,
            followUpSuggestions: interpretation.followUpSuggestions,
            overallHealthScore: interpretation.overallHealthScore,
            disclaimer: interpretation.disclaimer,
          })
        ),
        tokensUsed: interpretation.tokensUsed,
        modelVersion: interpretation.modelVersion,
        promptVersion: this.promptVersion,
      },
    });

    logger.info('Blood test interpretation generated', {
      testId,
      tokensUsed: interpretation.tokensUsed,
    });

    return interpretation;
  }

  /**
   * Get existing interpretation
   */
  async getInterpretation(
    testId: string,
    userId: string
  ): Promise<BloodTestInterpretationResult | null> {
    // Verify ownership
    const test = await prisma.bloodTest.findUnique({
      where: { id: testId, userId },
      select: { id: true },
    });

    if (!test) {
      return null;
    }

    const interpretation = await prisma.bloodTestInterpretation.findUnique({
      where: { bloodTestId: testId },
    });

    if (!interpretation) {
      return null;
    }

    return this.decryptInterpretation(interpretation);
  }

  /**
   * Regenerate interpretation (e.g., after model update)
   */
  async regenerateInterpretation(
    testId: string,
    userId: string
  ): Promise<BloodTestInterpretationResult> {
    // Delete existing
    await prisma.bloodTestInterpretation.deleteMany({
      where: { bloodTestId: testId },
    });

    // Generate new
    return this.interpretBloodTest(testId, userId);
  }

  // ============================================
  // Private Methods
  // ============================================

  private async generateInterpretation(
    biomarkers: Array<{
      code: string;
      name: string;
      value: number;
      unit: string;
      referenceMin?: number;
      referenceMax?: number;
      isAbnormal: boolean;
      category: string;
    }>,
    userContext: { age?: number; gender?: string | null }
  ): Promise<BloodTestInterpretationResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(biomarkers, userContext);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: config.anthropic.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }

    const parsed = this.parseInterpretationResponse(content.text);

    return {
      ...parsed,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      modelVersion: this.model,
    };
  }

  private buildSystemPrompt(): string {
    return `You are HealthPilot's Blood Test Interpretation AI, a sophisticated medical education tool designed to help users understand their blood test results.

## YOUR ROLE
- Provide educational interpretation of blood test results
- Explain what each biomarker means in plain language
- Identify patterns and correlations between markers
- Suggest general lifestyle and nutrition considerations
- Flag results that warrant professional medical attention

## CRITICAL BOUNDARIES - YOU MUST NOT:
- Diagnose any medical condition
- Recommend specific medications or treatments
- Override or contradict medical professional advice
- Provide medical advice for specific conditions
- Make definitive statements about disease presence

## RESPONSE FORMAT
Respond with a JSON object containing:
{
  "summary": "A 2-3 paragraph overview of the blood test results in plain language",
  "overallHealthScore": "EXCELLENT|GOOD|FAIR|NEEDS_ATTENTION|CONCERNING",
  "keyFindings": [
    {
      "biomarkerCode": "string",
      "biomarkerName": "string",
      "value": number,
      "unit": "string",
      "status": "OPTIMAL|NORMAL|SUBOPTIMAL|LOW|HIGH|CRITICAL",
      "interpretation": "What this result means",
      "clinicalSignificance": "Why this matters for health",
      "potentialCauses": ["possible cause 1", "possible cause 2"],
      "relatedBiomarkers": ["related biomarker codes"]
    }
  ],
  "recommendations": [
    {
      "category": "LIFESTYLE|NUTRITION|SUPPLEMENT|FOLLOW_UP|URGENT",
      "priority": "LOW|MEDIUM|HIGH|URGENT",
      "title": "Short action title",
      "description": "Detailed description of the recommendation",
      "rationale": "Why this is recommended based on the results",
      "relatedBiomarkers": ["related codes"],
      "timeframe": "When to implement or reassess"
    }
  ],
  "riskFactors": ["List of potential risk factors identified"],
  "positiveIndicators": ["List of positive health indicators"],
  "followUpSuggestions": ["Suggested follow-up tests or actions"],
  "disclaimer": "A reminder that this is educational only"
}

## INTERPRETATION GUIDELINES
1. Always explain biomarkers in terms users can understand
2. Provide context on what "normal" means and variations
3. Consider age and gender when interpreting results
4. Highlight correlations between markers (e.g., thyroid panel relationships)
5. Be encouraging about positive results while being clear about concerns
6. For any CRITICAL or HIGH-priority findings, strongly recommend professional consultation

## LANGUAGE TONE
- Warm and supportive
- Educational and informative
- Clear and jargon-free (explain medical terms when used)
- Empowering rather than alarming
- Balanced between honesty and reassurance`;
  }

  private buildUserPrompt(
    biomarkers: Array<{
      code: string;
      name: string;
      value: number;
      unit: string;
      referenceMin?: number;
      referenceMax?: number;
      isAbnormal: boolean;
      category: string;
    }>,
    userContext: { age?: number; gender?: string | null }
  ): string {
    let prompt = `Please analyze the following blood test results and provide a comprehensive interpretation.\n\n`;

    // User context
    prompt += `## USER CONTEXT\n`;
    if (userContext.age) {
      prompt += `- Age: ${userContext.age} years\n`;
    }
    if (userContext.gender) {
      prompt += `- Gender: ${userContext.gender}\n`;
    }
    prompt += `\n`;

    // Biomarker results
    prompt += `## BLOOD TEST RESULTS\n\n`;

    // Group by category
    const byCategory = biomarkers.reduce<Record<string, typeof biomarkers>>((acc, b) => {
      if (!acc[b.category]) {
        acc[b.category] = [];
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      acc[b.category]!.push(b);
      return acc;
    }, {});

    for (const [category, markers] of Object.entries(byCategory)) {
      prompt += `### ${category.toUpperCase()}\n`;
      for (const m of markers) {
        const refRange =
          m.referenceMin !== undefined && m.referenceMax !== undefined
            ? `(Reference: ${m.referenceMin}-${m.referenceMax} ${m.unit})`
            : '';
        const flag = m.isAbnormal ? ' ⚠️ ABNORMAL' : '';
        prompt += `- **${m.name}** (${m.code}): ${m.value} ${m.unit} ${refRange}${flag}\n`;
      }
      prompt += `\n`;
    }

    prompt += `\nPlease provide your interpretation in the JSON format specified. Focus on actionable insights and clear explanations.`;

    return prompt;
  }

  private parseInterpretationResponse(
    text: string
  ): Omit<BloodTestInterpretationResult, 'tokensUsed' | 'modelVersion'> {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonText = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch?.[1]) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);

      return {
        summary: parsed.summary || 'Unable to generate summary',
        overallHealthScore: parsed.overallHealthScore || 'FAIR',
        keyFindings: parsed.keyFindings || [],
        recommendations: parsed.recommendations || [],
        riskFactors: parsed.riskFactors || [],
        positiveIndicators: parsed.positiveIndicators || [],
        followUpSuggestions: parsed.followUpSuggestions || [],
        disclaimer:
          parsed.disclaimer ||
          'This interpretation is for educational purposes only and does not constitute medical advice. Please consult a healthcare professional for medical decisions.',
      };
    } catch (error) {
      logger.error('Failed to parse interpretation response', { error, text });

      // Return a basic interpretation if parsing fails
      return {
        summary: text.substring(0, 500),
        overallHealthScore: 'FAIR',
        keyFindings: [],
        recommendations: [],
        riskFactors: [],
        positiveIndicators: [],
        followUpSuggestions: ['Please consult with a healthcare provider to review your results.'],
        disclaimer:
          'This interpretation is for educational purposes only and does not constitute medical advice.',
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private decryptInterpretation(stored: any): BloodTestInterpretationResult {
    const summary = encryptionService.decrypt(stored.summaryEncrypted);
    const findings = JSON.parse(encryptionService.decrypt(stored.findingsEncrypted));
    const actions = JSON.parse(encryptionService.decrypt(stored.actionsEncrypted));

    return {
      summary,
      overallHealthScore: actions.overallHealthScore || 'FAIR',
      keyFindings: findings,
      recommendations: actions.recommendations || [],
      riskFactors: actions.riskFactors || [],
      positiveIndicators: actions.positiveIndicators || [],
      followUpSuggestions: actions.followUpSuggestions || [],
      disclaimer: actions.disclaimer || 'This is educational content only.',
      tokensUsed: stored.tokensUsed,
      modelVersion: stored.modelVersion,
    };
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
// Export Biomarker Reference Data
// ============================================

export const BIOMARKER_REFERENCES = {
  // Thyroid Panel
  TSH: {
    name: 'Thyroid Stimulating Hormone',
    category: 'thyroid',
    unit: 'mIU/L',
    min: 0.4,
    max: 4.0,
  },
  T4_FREE: { name: 'Free T4', category: 'thyroid', unit: 'ng/dL', min: 0.8, max: 1.8 },
  T3_FREE: { name: 'Free T3', category: 'thyroid', unit: 'pg/mL', min: 2.3, max: 4.2 },

  // Hormones
  TESTOSTERONE_TOTAL: {
    name: 'Total Testosterone',
    category: 'hormone',
    unit: 'ng/dL',
    minMale: 300,
    maxMale: 1000,
    minFemale: 15,
    maxFemale: 70,
  },
  ESTRADIOL: {
    name: 'Estradiol',
    category: 'hormone',
    unit: 'pg/mL',
    minMale: 10,
    maxMale: 40,
    minFemale: 30,
    maxFemale: 400,
  },
  CORTISOL: { name: 'Cortisol (AM)', category: 'hormone', unit: 'mcg/dL', min: 6.0, max: 18.4 },

  // Metabolic
  HBA1C: {
    name: 'Hemoglobin A1c',
    category: 'metabolic',
    unit: '%',
    optimal: 5.0,
    normal: 5.6,
    prediabetic: 6.4,
  },
  FASTING_GLUCOSE: {
    name: 'Fasting Glucose',
    category: 'metabolic',
    unit: 'mg/dL',
    min: 70,
    max: 100,
  },

  // Lipids
  TOTAL_CHOLESTEROL: { name: 'Total Cholesterol', category: 'lipid', unit: 'mg/dL', optimal: 200 },
  LDL: { name: 'LDL Cholesterol', category: 'lipid', unit: 'mg/dL', optimal: 100 },
  HDL: { name: 'HDL Cholesterol', category: 'lipid', unit: 'mg/dL', minMale: 40, minFemale: 50 },
  TRIGLYCERIDES: { name: 'Triglycerides', category: 'lipid', unit: 'mg/dL', optimal: 150 },

  // Vitamins & Minerals
  VIT_D: {
    name: 'Vitamin D (25-OH)',
    category: 'vitamin',
    unit: 'ng/mL',
    min: 30,
    max: 100,
    optimal: 50,
  },
  VIT_B12: { name: 'Vitamin B12', category: 'vitamin', unit: 'pg/mL', min: 200, max: 900 },
  IRON: {
    name: 'Iron',
    category: 'mineral',
    unit: 'mcg/dL',
    minMale: 60,
    maxMale: 170,
    minFemale: 37,
    maxFemale: 145,
  },
  FERRITIN: {
    name: 'Ferritin',
    category: 'mineral',
    unit: 'ng/mL',
    minMale: 30,
    maxMale: 400,
    minFemale: 15,
    maxFemale: 150,
  },

  // Inflammation
  CRP: {
    name: 'C-Reactive Protein',
    category: 'inflammation',
    unit: 'mg/L',
    optimal: 1.0,
    elevated: 3.0,
  },
  ESR: {
    name: 'Erythrocyte Sedimentation Rate',
    category: 'inflammation',
    unit: 'mm/hr',
    maxMale: 15,
    maxFemale: 20,
  },
} as const;

// ============================================
// Singleton Instance
// ============================================

export const bloodTestInterpretationService = new BloodTestInterpretationService();
export default bloodTestInterpretationService;
