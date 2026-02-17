import { config } from '../../../config/index.js';
import logger from '../../../utils/logger.js';
import type {
  IAIService,
} from './base-ai-provider.interface.js';
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  HealthIntakeData,
  BloodTestResult,
} from '../../../types/index.js';
import jwt from 'jsonwebtoken';

/**
 * GLM (ChatGLM/Zhipu AI) Provider Implementation
 * API Documentation: https://open.bigmodel.cn/dev/api#aichat
 */
export class GLMProvider implements IAIService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiUrl: string;
  private readonly maxTokens: number;
  private readonly timeout: number;

  constructor() {
    if (!config.glm.apiKey) {
      logger.warn('GLM API key not configured - GLM features will be disabled');
    }

    this.apiKey = config.glm.apiKey || '';
    this.model = config.glm.model;
    this.apiUrl = config.glm.apiUrl;
    this.maxTokens = config.glm.maxTokens;
    this.timeout = config.glm.timeout;
  }

  /**
   * Analyze health data using GLM
   * Note: This is educational/informational only - NOT diagnostic
   */
  async analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildHealthAnalysisPrompt(request);

      const response = await this.callGLMAPI(systemPrompt, userPrompt);

      const parsedResponse = this.parseHealthAnalysisResponse(response);

      const duration = Date.now() - startTime;
      logger.info('GLM health analysis completed', {
        duration: `${duration}ms`,
        model: this.model,
      });

      return {
        ...parsedResponse,
        tokensUsed: this.estimateTokens(systemPrompt + userPrompt + response),
        modelVersion: this.model,
        promptVersion: 'v1.0.0',
      };
    } catch (error) {
      logger.error('GLM health analysis failed', { error });
      throw error;
    }
  }

  /**
   * Generate explanation for "Why this?" feature
   */
  async generateExplanation(
    topic: string,
    context: Record<string, unknown>
  ): Promise<string> {
    try {
      const systemPrompt = `You are a health education assistant. Provide clear, accurate explanations
               about health topics. Always include appropriate disclaimers that this is
               educational information only and not medical advice.

               Keep explanations simple and concise (2-3 paragraphs).`;

      const userPrompt = `Explain the following in simple terms: ${topic}\n\nContext: ${JSON.stringify(context)}`;

      const response = await this.callGLMAPI(systemPrompt, userPrompt);

      return response;
    } catch (error) {
      logger.error('GLM explanation generation failed', { error });
      throw error;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'glm';
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return this.model;
  }

  /**
   * Call GLM API with retry logic
   */
  private async callGLMAPI(
    systemPrompt: string,
    userPrompt: string,
    retries = 3
  ): Promise<string> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.generateToken()}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userPrompt,
              },
            ],
            max_tokens: this.maxTokens,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `GLM API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json() as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

        // GLM response format: choices[0].message.content
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
          throw new Error('Invalid GLM API response format');
        }

        return data.choices[0].message.content;
      } catch (error) {
        if (attempt === retries - 1) {
          throw error; // Re-throw on last attempt
        }

        // Exponential backoff
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn(`GLM API call failed, retrying in ${backoffDelay}ms...`, {
          attempt: attempt + 1,
          error,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }

    throw new Error('GLM API call failed after retries');
  }

  /**
   * Build system prompt for health analysis
   * GLM responds better to direct, explicit instructions
   */
  private buildSystemPrompt(): string {
    return `You are a health education assistant for HealthPilot.

CRITICAL BOUNDARIES:
- You are NOT a doctor and cannot diagnose conditions
- You are NOT prescribing treatments
- You provide EDUCATIONAL information only
- All recommendations are for INFORMATIONAL purposes
- Users must consult licensed healthcare providers for medical decisions

YOUR TASK:
Analyze the provided health intake data and generate a clear, educational summary.

OUTPUT FORMAT (JSON only, no markdown):
{
  "healthSummary": "2-3 sentence overall health overview",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  "warnings": [
    "Any areas that may require professional attention"
  ]
}

GUIDELINES:
- Be direct and specific
- Focus on actionable insights
- Highlight any concerning patterns
- Keep explanations simple and clear
- Always include medical disclaimer in warnings
- Return ONLY valid JSON, no additional text`;
  }

  /**
   * Build user prompt for health analysis
   */
  private buildHealthAnalysisPrompt(request: AIAnalysisRequest): string {
    const sections: string[] = [];

    // User demographics
    if (request.userAge || request.userGender) {
      sections.push(
        `## User Profile\n- Age: ${request.userAge || 'Not provided'}\n- Gender: ${request.userGender || 'Not provided'
        }`
      );
    }

    // Health intake data
    sections.push(this.formatIntakeData(request.intakeData));

    // Blood test results
    if (request.bloodTestResults && request.bloodTestResults.length > 0) {
      sections.push(this.formatBloodTestResults(request.bloodTestResults));
    }

    return `Analyze this health information and generate educational insights:\n\n${sections.join(
      '\n\n'
    )}\n\nRemember: Provide educational information only. Return JSON response.`;
  }

  /**
   * Format intake data for prompt
   */
  private formatIntakeData(data: HealthIntakeData): string {
    const sections: string[] = [];
    sections.push('## Health Intake Data');

    // Biometrics
    if (data.biometrics) {
      sections.push('### Biometrics');
      sections.push(`- Height: ${data.biometrics.height} cm`);
      sections.push(`- Weight: ${data.biometrics.weight} kg`);
      if (data.biometrics.bmi) {
        sections.push(`- BMI: ${data.biometrics.bmi.toFixed(1)}`);
      }
    }

    // Goals
    if (data.goals && data.goals.length > 0) {
      sections.push('### Health Goals');
      data.goals.forEach((goal) => {
        sections.push(
          `- ${goal.category}: ${goal.description} (Priority: ${goal.priority})`
        );
      });
    }

    // Symptoms
    if (data.symptoms && data.symptoms.length > 0) {
      sections.push('### Current Symptoms');
      data.symptoms.forEach((symptom) => {
        sections.push(
          `- ${symptom.name}: ${symptom.severity} severity, ${symptom.duration}, ${symptom.frequency}`
        );
      });
    }

    // Lifestyle
    if (data.lifestyle) {
      sections.push('### Lifestyle Factors');
      sections.push(`- Exercise: ${data.lifestyle.exerciseFrequency}`);
      sections.push(`- Sleep: ${data.lifestyle.sleepHours} hours`);
      sections.push(`- Stress Level: ${data.lifestyle.stressLevel}`);
      sections.push(`- Smoking: ${data.lifestyle.smokingStatus}`);
      sections.push(`- Alcohol: ${data.lifestyle.alcoholConsumption}`);
    }

    // Medical history
    if (data.medicalHistory) {
      sections.push('### Medical History');
      if (data.medicalHistory.conditions && data.medicalHistory.conditions.length > 0) {
        sections.push(`- Existing conditions: ${data.medicalHistory.conditions.join(', ')}`);
      }
      if (
        data.medicalHistory.currentMedications &&
        data.medicalHistory.currentMedications.length > 0
      ) {
        sections.push(`- Current medications: ${data.medicalHistory.currentMedications.map(m => m.name).join(', ')}`);
      }
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
      sections.push(
        `- ${result.biomarkerCode}: ${result.value} ${result.unit} ${range} ${status}`
      );
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
    } catch (error) {
      logger.error('Failed to parse GLM response', { error });
      // If parsing fails, return raw text
      return {
        healthSummary: text,
        recommendations: [],
        warnings: [],
      };
    }
  }

  /**
   * Estimate token count (rough approximation)
   * GLM uses ~1.5 tokens per word for English
   */
  /**
   * Estimate token count (rough approximation)
   * GLM uses ~1.5 tokens per word for English
   */
  private estimateTokens(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount * 1.5);
  }

  /**
   * Generate JWT token for Zhipu AI API
   */
  private generateToken(): string {
    const [id, secret] = this.apiKey.split('.');

    if (!id || !secret) {
      throw new Error('Invalid GLM API Key format. Expected format: id.secret');
    }

    const payload = {
      api_key: id,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Zhipu requires specific header with sign_type
    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      header: {
        alg: 'HS256',
        sign_type: 'SIGN',
      } as any,
    });
  }
}
