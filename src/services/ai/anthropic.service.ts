import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  HealthIntakeData,
  BloodTestResult,
  Gender,
} from '../../types/index.js';

// ============================================
// AI Service Interface (SOLID - ISP)
// ============================================
export interface IAIService {
  analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
  generateExplanation(topic: string, context: Record<string, unknown>): Promise<string>;
}

// ============================================
// Anthropic AI Service Implementation
// ============================================
export class AnthropicService implements IAIService {
  private client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor() {
    if (!config.anthropic.apiKey) {
      logger.warn('Anthropic API key not configured - AI features will be disabled');
    }

    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey || 'dummy-key',
    });

    this.model = config.anthropic.model;
    this.maxTokens = config.anthropic.maxTokens;
  }

  /**
   * Analyze health data and generate recommendations
   * Note: This is educational/informational only - NOT diagnostic
   */
  async analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildHealthAnalysisPrompt(request);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content?.type !== 'text') {
        throw new Error('Unexpected response format from AI');
      }

      const parsedResponse = this.parseHealthAnalysisResponse(content.text);

      const duration = Date.now() - startTime;
      logger.info('AI health analysis completed', {
        duration: `${duration}ms`,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      });

      return {
        ...parsedResponse,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        modelVersion: this.model,
        promptVersion: 'v1.0.0',
      };
    } catch (error) {
      logger.error('AI health analysis failed', { error });
      throw error;
    }
  }

  /**
   * Generate explanation for "Why this?" feature
   */
  async generateExplanation(topic: string, context: Record<string, unknown>): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: `You are a health education assistant. Provide clear, accurate explanations 
                 about health topics. Always include appropriate disclaimers that this is 
                 educational information only and not medical advice.`,
        messages: [
          {
            role: 'user',
            content: `Explain the following in simple terms: ${topic}\n\nContext: ${JSON.stringify(context)}`,
          },
        ],
      });

      const content = response.content[0];
      if (content?.type !== 'text') {
        throw new Error('Unexpected response format from AI');
      }

      return content.text;
    } catch (error) {
      logger.error('AI explanation generation failed', { error });
      throw error;
    }
  }

  /**
   * Build system prompt for health analysis
   */
  private buildSystemPrompt(): string {
    return `You are a health education and treatment pathway assistant for HealthPilot, 
a platform that helps users understand their health data and explore treatment options.

CRITICAL BOUNDARIES:
- You are NOT a doctor and cannot diagnose conditions
- You are NOT prescribing treatments
- You provide EDUCATIONAL information only
- All recommendations are for INFORMATIONAL purposes
- Users must consult licensed healthcare providers for medical decisions

YOUR ROLE:
1. Analyze health intake data and blood test results (if provided)
2. Identify potential areas of interest based on the data
3. Suggest treatment pathways that may be relevant
4. Explain biomarker results in simple terms
5. Highlight any values that may warrant professional attention

OUTPUT FORMAT:
Provide your response in the following JSON structure:
{
  "healthSummary": "A clear, educational overview of the health data",
  "recommendations": ["List of educational recommendations"],
  "warnings": ["Any values or patterns that warrant professional attention"]
}

Always maintain a supportive, educational tone while being clear about limitations.`;
  }

  /**
   * Build user prompt for health analysis
   */
  private buildHealthAnalysisPrompt(request: AIAnalysisRequest): string {
    const sections: string[] = [];

    // User demographics
    if (request.userAge || request.userGender) {
      sections.push(`## User Profile
- Age: ${request.userAge || 'Not provided'}
- Gender: ${this.formatGender(request.userGender)}`);
    }

    // Health intake data
    sections.push(this.formatIntakeData(request.intakeData));

    // Blood test results
    if (request.bloodTestResults && request.bloodTestResults.length > 0) {
      sections.push(this.formatBloodTestResults(request.bloodTestResults));
    }

    return `Please analyze the following health information and provide educational insights:

${sections.join('\n\n')}

Remember: Provide educational information only. Do not diagnose or prescribe.`;
  }

  /**
   * Format gender for prompt
   */
  private formatGender(gender?: Gender): string {
    if (!gender) {
      return 'Not provided';
    }
    const genderMap: Record<Gender, string> = {
      MALE: 'Male',
      FEMALE: 'Female',
      OTHER: 'Other',
      PREFER_NOT_TO_SAY: 'Prefer not to say',
    };
    return genderMap[gender];
  }

  /**
   * Format intake data for prompt
   */
  private formatIntakeData(data: HealthIntakeData): string {
    const sections: string[] = ['## Health Intake Data'];

    // Goals
    if (data.goals.length > 0) {
      sections.push('### Health Goals');
      data.goals.forEach((goal) => {
        sections.push(`- ${goal.category}: ${goal.description} (Priority: ${goal.priority})`);
      });
    }

    // Symptoms
    if (data.symptoms.length > 0) {
      sections.push('### Current Symptoms');
      data.symptoms.forEach((symptom) => {
        sections.push(
          `- ${symptom.name}: ${symptom.severity} severity, ${symptom.duration}, ${symptom.frequency}`
        );
      });
    }

    // Lifestyle
    sections.push('### Lifestyle Factors');
    sections.push(`- Exercise: ${data.lifestyle.exerciseFrequency}`);
    sections.push(`- Sleep: ${data.lifestyle.sleepHours} hours`);
    sections.push(`- Stress Level: ${data.lifestyle.stressLevel}`);
    sections.push(`- Smoking: ${data.lifestyle.smokingStatus}`);
    sections.push(`- Alcohol: ${data.lifestyle.alcoholConsumption}`);

    // Medical history (summarized, not detailed)
    if (data.medicalHistory.conditions.length > 0) {
      sections.push('### Medical History');
      sections.push(`- Existing conditions: ${data.medicalHistory.conditions.length} reported`);
      sections.push(
        `- Current medications: ${data.medicalHistory.currentMedications.length} reported`
      );
    }

    return sections.join('\n');
  }

  /**
   * Format blood test results for prompt
   */
  private formatBloodTestResults(results: BloodTestResult[]): string {
    const sections: string[] = ['## Blood Test Results'];

    results.forEach((result) => {
      const status = result.isAbnormal ? '⚠️ ABNORMAL' : '✓ Normal';
      const range =
        result.referenceMin !== undefined && result.referenceMax !== undefined
          ? `(Ref: ${result.referenceMin}-${result.referenceMax})`
          : '';
      sections.push(`- ${result.biomarkerCode}: ${result.value} ${result.unit} ${range} ${status}`);
    });

    return sections.join('\n');
  }

  /**
   * Parse AI response into structured format
   */
  private parseHealthAnalysisResponse(
    text: string
  ): Omit<AIAnalysisResponse, 'tokensUsed' | 'modelVersion' | 'promptVersion'> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          healthSummary?: string;
          recommendations?: string[];
          warnings?: string[];
        };
        return {
          healthSummary: parsed.healthSummary || text,
          recommendations: parsed.recommendations || [],
          warnings: parsed.warnings || [],
        };
      }

      // Fallback: return raw text as summary
      return {
        healthSummary: text,
        recommendations: [],
        warnings: [],
      };
    } catch {
      // If parsing fails, return raw text
      return {
        healthSummary: text,
        recommendations: [],
        warnings: [],
      };
    }
  }
}

// ============================================
// Singleton Instance
// ============================================
export const anthropicService = new AnthropicService();
export default anthropicService;
