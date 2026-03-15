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
  IntakeScoringContext,
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
6. Use any provided intake scoring context as a first-class signal when summarizing priorities and overall risk

OUTPUT FORMAT:
Provide your response as a valid JSON object with this structure:
{
  "healthSummary": "A clear, educational overview of the health data (2-3 paragraphs)",
  "recommendations": ["List of educational recommendations"],
  "warnings": ["Any values or patterns that warrant professional attention"],
  "structuredSummary": {
    "plainLanguageSummary": ["Short paragraph 1", "Short paragraph 2"],
    "responseSignals": [
      {
        "title": "From your responses",
        "items": ["Signal 1", "Signal 2"]
      }
    ],
    "bloodTestSignals": [
      {
        "biomarkerCode": "LDL",
        "displayName": "LDL Cholesterol",
        "value": 98,
        "unit": "mg/dL",
        "referenceRange": "0 - 100",
        "status": "IN_RANGE|SLIGHTLY_HIGH|SLIGHTLY_LOW",
        "detail": "Plain-language explanation of this marker"
      }
    ],
    "whatThisMayMean": ["Short interpretation point"],
    "limitationsAndBoundaries": ["Short limitation"],
    "nextActionLabel": "View personalized recommendations"
  },
  "solutionPlan": {
    "strategyTitle": "Short plan title for the best overall path",
    "strategySummary": "1-2 sentence summary explaining the overall strategy",
    "whyThisPlan": ["Short bullet reason", "Short bullet reason"],
    "focusCategories": [
      {
        "id": "LOW_ENERGY|DIGESTIVE_DISCOMFORT|POOR_SLEEP|WEIGHT_MANAGEMENT",
        "label": "Category label",
        "reason": "Why this category matters for the user"
      }
    ]
  }
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

    if (request.intakeScoring) {
      sections.push(this.formatIntakeScoring(request.intakeScoring));
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
Blood reports may appear in many formats, including tables, grouped sections, narrative summaries, and multi-page PDFs.
Extract all visible biomarkers into structured rows even when the layout differs between documents.
For each biomarker, include:
- name
- code if obvious, otherwise omit
- numeric value
- unit
- referenceMin/referenceMax if visible
- status if clearly high/low/normal from the report
- flag if the report explicitly marks it
Do not invent biomarkers that are not visible.
If a range is shown as "<42" or ">90", convert that to referenceMax or referenceMin respectively.
Also extract any visible patient identifier or specimen identifier when present so downstream systems can detect mixed-patient uploads.
Provide educational context about what the visible biomarkers indicate.`,

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
  "extractedData": {
    "labName": "string or null",
    "reportDate": "string or null",
    "patientIdentifier": "string or null",
    "specimenIdentifier": "string or null",
    "fastingStatus": "fasting|non_fasting|unknown",
    "biomarkers": [
      {
        "name": "HbA1c",
        "code": "HBA1C",
        "value": 35,
        "unit": "mmol/mol",
        "referenceMin": null,
        "referenceMax": 42,
        "status": "normal",
        "flag": null
      }
    ]
  },
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

    if (data.rawResponses?.bloodTestSource) {
      sections.push('### Blood Test Journey');
      sections.push(
        `- Source: ${
          data.rawResponses.bloodTestSource === 'upload'
            ? 'Uploaded existing blood test'
            : 'Ordered through HealthPilot'
        }`
      );
      sections.push(
        `- Summary framing: ${
          data.rawResponses.bloodTestSource === 'upload'
            ? 'Keep the summary focused on interpreting the uploaded report with intake answers as supporting context.'
            : 'Compare the detailed intake answers with the ordered blood test results and produce an in-depth combined recap.'
        }`
      );
    }

    if (data.rawResponses) {
      sections.push('### Admin Intake Answers');
      sections.push(JSON.stringify(data.rawResponses, null, 2));
    }

    return sections.join('\n');
  }

  private formatIntakeScoring(scoring: IntakeScoringContext): string {
    const sections: string[] = ['## Intake Scoring Context'];
    sections.push(`- Intake Assignment: ${scoring.assignment}`);
    sections.push(`- Overall Score: ${scoring.overallScore}`);

    if (scoring.riskBucket) {
      sections.push(
        `- Risk Bucket: ${scoring.riskBucket.label} (${scoring.riskBucket.minScore}-${scoring.riskBucket.maxScore})`
      );
      if (scoring.riskBucket.description) {
        sections.push(`- Risk Interpretation: ${scoring.riskBucket.description}`);
      }
    }

    if (scoring.summarySignals.length > 0) {
      sections.push('### Scoring Signals');
      scoring.summarySignals.forEach((signal) => {
        sections.push(`- ${signal}`);
      });
    }

    if (scoring.domains.length > 0) {
      sections.push('### Domain Scores');
      scoring.domains.forEach((domain) => {
        sections.push(
          `- ${domain.domainName}: weighted ${domain.weightedScore}, raw ${domain.rawScore}, weight ${domain.weight}`
        );
        domain.evidence.forEach((evidence) => {
          sections.push(`  - Evidence: ${evidence}`);
        });
      });
    }

    if (scoring.tags && scoring.tags.length > 0) {
      sections.push(`### Active Tags\n- ${scoring.tags.join('\n- ')}`);
    }

    if (scoring.includedPathways && scoring.includedPathways.length > 0) {
      sections.push(`### Included Pathways\n- ${scoring.includedPathways.join('\n- ')}`);
    }

    if (scoring.excludedPathways && scoring.excludedPathways.length > 0) {
      sections.push(`### Excluded Pathways\n- ${scoring.excludedPathways.join('\n- ')}`);
    }

    if (scoring.mappedHeadline) {
      sections.push('### Output Mapping Headline');
      sections.push(`- Headline: ${scoring.mappedHeadline.headline}`);
      sections.push(`- Summary: ${scoring.mappedHeadline.summary}`);
    }

    if (scoring.mappedTagInsights && scoring.mappedTagInsights.length > 0) {
      sections.push('### Output Mapping Tag Insights');
      scoring.mappedTagInsights.forEach((insight) => {
        sections.push(`- ${insight}`);
      });
    }

    if (scoring.recommendationPriority && scoring.recommendationPriority.length > 0) {
      sections.push('### Recommendation Priority Order');
      scoring.recommendationPriority.forEach((priority, index) => {
        sections.push(`- ${index + 1}. ${priority}`);
      });
    }

    sections.push(
      'Use this scoring context together with the intake answers and blood results. Respect the active tags, rule-triggered pathways, and output-mapping guidance when deciding which patterns deserve emphasis.'
    );

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
        structuredSummary?: AIAnalysisResponse['structuredSummary'];
        solutionPlan?: AIAnalysisResponse['solutionPlan'];
      };

      return {
        healthSummary: parsed.healthSummary || 'Unable to generate health summary.',
        recommendations: parsed.recommendations || [],
        warnings: parsed.warnings || ['This analysis is for educational purposes only.'],
        ...(parsed.structuredSummary ? { structuredSummary: parsed.structuredSummary } : {}),
        ...(parsed.solutionPlan ? { solutionPlan: parsed.solutionPlan } : {}),
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
            structuredSummary?: AIAnalysisResponse['structuredSummary'];
            solutionPlan?: AIAnalysisResponse['solutionPlan'];
          };
          return {
            healthSummary: parsed.healthSummary || text,
            recommendations: parsed.recommendations || [],
            warnings: parsed.warnings || [],
            ...(parsed.structuredSummary ? { structuredSummary: parsed.structuredSummary } : {}),
            ...(parsed.solutionPlan ? { solutionPlan: parsed.solutionPlan } : {}),
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
