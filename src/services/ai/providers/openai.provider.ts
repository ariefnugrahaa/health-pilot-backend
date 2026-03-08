import OpenAI from 'openai';
import { config } from '../../../config/index.js';
import logger from '../../../utils/logger.js';
import type {
  IAIService,
  ImageAnalysisRequest,
  ImageAnalysisResponse,
  ReportGenerationRequest,
  ReportGenerationResponse,
} from './base-ai-provider.interface.js';
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  HealthIntakeData,
  BloodTestResult,
  Gender,
} from '../../../types/index.js';

/**
 * OpenAI Provider Implementation
 * Supports GPT-4o for text analysis and GPT-4 Vision for image analysis
 */
export class OpenAIProvider implements IAIService {
  private client: OpenAI;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly maxTokens: number;

  constructor() {
    if (!config.openai.apiKey) {
      logger.warn('OpenAI API key not configured - AI features will be disabled');
    }

    this.client = new OpenAI({
      apiKey: config.openai.apiKey || 'dummy-key',
      timeout: config.openai.timeout,
    });

    this.model = config.openai.model;
    this.visionModel = config.openai.visionModel;
    this.maxTokens = config.openai.maxTokens;
  }

  /**
   * Analyze health data using OpenAI
   * Note: This is educational/informational only - NOT diagnostic
   */
  async analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildHealthAnalysisPrompt(request);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsedResponse = this.parseHealthAnalysisResponse(content);

      const duration = Date.now() - startTime;
      const tokensUsed = response.usage?.total_tokens || 0;

      logger.info('OpenAI health analysis completed', {
        duration: `${duration}ms`,
        tokensUsed,
        model: this.model,
      });

      return {
        ...parsedResponse,
        tokensUsed,
        modelVersion: this.model,
        promptVersion: 'v1.0.0',
      };
    } catch (error) {
      logger.error('OpenAI health analysis failed', { error });
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: `You are a health education assistant. Provide clear, accurate explanations
                     about health topics. Always include appropriate disclaimers that this is
                     educational information only and not medical advice.`,
          },
          {
            role: 'user',
            content: `Explain the following in simple terms: ${topic}\n\nContext: ${JSON.stringify(
              context
            )}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return content;
    } catch (error) {
      logger.error('OpenAI explanation generation failed', { error });
      throw error;
    }
  }

  /**
   * Analyze images for health-related insights
   * Supports blood test reports, medical documents, and general health images
   */
  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildImageAnalysisSystemPrompt(request.analysisType);
      const userContent = this.buildImageAnalysisUserContent(request);

      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI Vision');
      }

      const parsed = JSON.parse(content) as ImageAnalysisResponse;
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage?.total_tokens || 0;

      logger.info('OpenAI image analysis completed', {
        duration: `${duration}ms`,
        tokensUsed,
        model: this.visionModel,
        imageCount: request.images.length,
        analysisType: request.analysisType,
      });

      return {
        ...parsed,
        tokensUsed,
        modelVersion: this.visionModel,
      };
    } catch (error) {
      logger.error('OpenAI image analysis failed', { error });
      throw error;
    }
  }

  /**
   * Generate comprehensive health report
   */
  async generateReport(request: ReportGenerationRequest): Promise<ReportGenerationResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildReportSystemPrompt(request.reportType);
      const userPrompt = this.buildReportUserPrompt(request);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // Add text content
      const userContent: OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'] = [
        { type: 'text', text: userPrompt },
      ];

      // Add images if provided
      if (request.images && request.images.length > 0) {
        for (const image of request.images) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: image.source.startsWith('data:')
                ? image.source
                : `data:${image.mimeType};base64,${image.source}`,
            },
          });
        }
      }

      messages.push({ role: 'user', content: userContent });

      const response = await this.client.chat.completions.create({
        model: request.images?.length ? this.visionModel : this.model,
        max_tokens: this.maxTokens,
        messages,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content) as Omit<ReportGenerationResponse, 'tokensUsed' | 'modelVersion' | 'generatedAt'>;
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage?.total_tokens || 0;

      logger.info('OpenAI report generation completed', {
        duration: `${duration}ms`,
        tokensUsed,
        model: request.images?.length ? this.visionModel : this.model,
        reportType: request.reportType,
        hasImages: !!request.images?.length,
        hasDocuments: !!request.documents?.length,
      });

      return {
        ...parsed,
        tokensUsed,
        modelVersion: request.images?.length ? this.visionModel : this.model,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('OpenAI report generation failed', { error });
      throw error;
    }
  }

  /**
   * Check if provider supports image analysis
   */
  supportsImageAnalysis(): boolean {
    return true;
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'openai';
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return this.model;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

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
Provide your response as a valid JSON object with this structure:
{
  "healthSummary": "A clear, educational overview of the health data (2-3 paragraphs)",
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
      sections.push(
        `## User Profile\n- Age: ${request.userAge || 'Not provided'}\n- Gender: ${this.formatGender(
          request.userGender
        )}`
      );
    }

    // Health intake data
    sections.push(this.formatIntakeData(request.intakeData));

    // Blood test results
    if (request.bloodTestResults && request.bloodTestResults.length > 0) {
      sections.push(this.formatBloodTestResults(request.bloodTestResults));
    }

    return `Please analyze the following health information and provide educational insights:\n\n${sections.join(
      '\n\n'
    )}\n\nRemember: Provide educational information only. Do not diagnose or prescribe. Return valid JSON.`;
  }

  /**
   * Build system prompt for image analysis
   */
  private buildImageAnalysisSystemPrompt(analysisType: ImageAnalysisRequest['analysisType']): string {
    const basePrompt = `You are a health education assistant analyzing health-related images.
CRITICAL BOUNDARIES:
- You are NOT a doctor and cannot diagnose conditions
- You provide EDUCATIONAL information only
- Users must consult licensed healthcare providers for medical decisions`;

    const typeSpecificPrompts: Record<ImageAnalysisRequest['analysisType'], string> = {
      blood_test: `
YOUR TASK: Analyze blood test report images and extract relevant information.
Extract all visible biomarker values, their units, and reference ranges.
Identify any values that appear outside normal ranges.
Provide educational context about what each biomarker indicates.`,

      medical_document: `
YOUR TASK: Analyze medical document images and extract relevant health information.
Identify key findings, diagnoses (if any), medications, and recommendations.
Provide educational context about the medical information.`,

      general_health: `
YOUR TASK: Analyze health-related images and provide educational insights.
Identify any visible health-related information.
Provide general educational context.`,

      skin_analysis: `
YOUR TASK: Analyze skin images for general health education purposes.
Describe what you observe in general terms.
Recommend consulting a dermatologist for any concerns.
DO NOT diagnose skin conditions.`,
    };

    return `${basePrompt}${typeSpecificPrompts[analysisType]}

OUTPUT FORMAT:
Return a valid JSON object with this structure:
{
  "extractedData": { "biomarkerName": "value", ... },
  "summary": "Brief summary of findings",
  "observations": ["List of key observations"],
  "concerns": ["Any concerns that warrant professional attention"],
  "recommendations": ["Educational recommendations"],
  "confidence": "high|medium|low"
}`;
  }

  /**
   * Build user content for image analysis
   */
  private buildImageAnalysisUserContent(
    request: ImageAnalysisRequest
  ): OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'] {
    const content: OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'] = [];

    // Add context as text
    let contextText = `Analyze these health-related images.\nAnalysis type: ${request.analysisType}`;
    if (request.context) {
      contextText += `\n\nUser Context:`;
      if (request.context.userAge) contextText += `\n- Age: ${request.context.userAge}`;
      if (request.context.userGender) contextText += `\n- Gender: ${request.context.userGender}`;
      if (request.context.healthGoals?.length) {
        contextText += `\n- Health Goals: ${request.context.healthGoals.join(', ')}`;
      }
      if (request.context.knownConditions?.length) {
        contextText += `\n- Known Conditions: ${request.context.knownConditions.join(', ')}`;
      }
    }
    contextText += '\n\nReturn your analysis as valid JSON.';

    content.push({ type: 'text', text: contextText });

    // Add images
    for (const image of request.images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: image.source.startsWith('data:')
            ? image.source
            : `data:${image.mimeType};base64,${image.source}`,
        },
      });
    }

    return content;
  }

  /**
   * Build system prompt for report generation
   */
  private buildReportSystemPrompt(reportType: ReportGenerationRequest['reportType']): string {
    const basePrompt = `You are a comprehensive health report generator for HealthPilot.
CRITICAL BOUNDARIES:
- You are NOT a doctor and cannot diagnose conditions
- You provide EDUCATIONAL information only
- Users must consult licensed healthcare providers for medical decisions`;

    const typeSpecificPrompts: Record<ReportGenerationRequest['reportType'], string> = {
      comprehensive: `
Generate a comprehensive health report covering all aspects of the user's health data.
Include analysis of symptoms, lifestyle, goals, blood test results, and any uploaded documents/images.`,

      focused: `
Generate a focused report addressing specific health concerns or goals.
Prioritize information most relevant to the user's stated focus areas.`,

      follow_up: `
Generate a follow-up report highlighting changes, progress, and updated recommendations.
Compare current data with previous health information if available.`,
    };

    return `${basePrompt}${typeSpecificPrompts[reportType]}

OUTPUT FORMAT:
Return a valid JSON object with this structure:
{
  "executiveSummary": "2-3 sentence high-level summary",
  "healthOverview": "Detailed health overview (2-3 paragraphs)",
  "keyFindings": [
    { "category": "string", "finding": "string", "significance": "high|medium|low" }
  ],
  "recommendations": [
    { "category": "string", "recommendation": "string", "priority": "urgent|high|medium|low", "rationale": "string" }
  ],
  "monitoringPoints": ["Areas to track over time"],
  "riskFactors": ["Identified risk factors"],
  "positiveIndicators": ["Positive health indicators"],
  "followUpActions": ["Suggested next steps"],
  "disclaimers": ["Required medical disclaimers"]
}`;
  }

  /**
   * Build user prompt for report generation
   */
  private buildReportUserPrompt(request: ReportGenerationRequest): string {
    const sections: string[] = [];

    sections.push(`## Report Type: ${request.reportType.toUpperCase()}`);

    if (request.focusAreas?.length) {
      sections.push(`## Focus Areas\n${request.focusAreas.map(a => `- ${a}`).join('\n')}`);
    }

    // User demographics
    if (request.userAge || request.userGender) {
      sections.push(
        `## User Profile\n- Age: ${request.userAge || 'Not provided'}\n- Gender: ${this.formatGender(
          request.userGender
        )}`
      );
    }

    // Health intake data
    if (request.intakeData) {
      sections.push(this.formatIntakeData(request.intakeData));
    }

    // Blood test results
    if (request.bloodTestResults && request.bloodTestResults.length > 0) {
      sections.push(this.formatBloodTestResults(request.bloodTestResults));
    }

    // Documents
    if (request.documents && request.documents.length > 0) {
      sections.push('## Uploaded Documents');
      request.documents.forEach((doc, i) => {
        sections.push(`### Document ${i + 1}: ${doc.filename || 'Untitled'} (${doc.type || 'unknown'})`);
        sections.push(doc.content);
      });
    }

    // Images context
    if (request.images && request.images.length > 0) {
      sections.push(`## Attached Images\n${request.images.length} image(s) attached for analysis.`);
    }

    return `Generate a comprehensive health report based on the following data:\n\n${sections.join(
      '\n\n'
    )}\n\nReturn your report as valid JSON.`;
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
      if (data.medicalHistory.allergies && data.medicalHistory.allergies.length > 0) {
        sections.push(`- Allergies: ${data.medicalHistory.allergies.join(', ')}`);
      }
      if (
        data.medicalHistory.currentMedications &&
        data.medicalHistory.currentMedications.length > 0
      ) {
        sections.push(
          `- Current medications: ${data.medicalHistory.currentMedications.map((m) => m.name).join(', ')}`
        );
      }
    }

    // Family history
    if (data.familyHistory?.conditions && data.familyHistory.conditions.length > 0) {
      sections.push('### Family History');
      data.familyHistory.conditions.forEach((fc) => {
        sections.push(`- ${fc.relation}: ${fc.condition}`);
      });
    }

    // Preferences
    if (data.preferences) {
      sections.push('### Treatment Preferences');
      sections.push(`- Risk Tolerance: ${data.preferences.riskTolerance}`);
      sections.push(`- Budget Sensitivity: ${data.preferences.budgetSensitivity}`);
      sections.push(`- Delivery Preference: ${data.preferences.deliveryPreference}`);
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
      const parsed = JSON.parse(text) as {
        healthSummary?: string;
        recommendations?: string[];
        warnings?: string[];
      };

      return {
        healthSummary: parsed.healthSummary || 'Unable to generate health summary.',
        recommendations: parsed.recommendations || [],
        warnings: parsed.warnings || ['This analysis is for educational purposes only.'],
      };
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
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
        } catch {
          // Fall through to default
        }
      }

      // Fallback: return raw text as summary
      return {
        healthSummary: text,
        recommendations: [],
        warnings: ['Unable to parse structured response.'],
      };
    }
  }
}
