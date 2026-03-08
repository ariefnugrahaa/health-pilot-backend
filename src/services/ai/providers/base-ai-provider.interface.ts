import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
} from '../../../types/index.js';

/**
 * Image input for multimodal AI analysis
 */
export interface ImageInput {
  /** Base64 encoded image data or URL */
  source: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  mimeType: string;
  /** Optional description of the image */
  description?: string;
}

/**
 * Document input for AI analysis (e.g., blood test reports, medical documents)
 */
export interface DocumentInput {
  /** Extracted text content from document */
  content: string;
  /** Original filename */
  filename?: string;
  /** Document type hint */
  type?: 'blood_test' | 'lab_report' | 'medical_record' | 'prescription' | 'other';
}

/**
 * Request for image-based health analysis
 */
export interface ImageAnalysisRequest {
  /** Images to analyze */
  images: ImageInput[];
  /** Additional context for the analysis */
  context?: {
    userAge?: number;
    userGender?: string;
    healthGoals?: string[];
    knownConditions?: string[];
  };
  /** Type of analysis to perform */
  analysisType: 'blood_test' | 'medical_document' | 'general_health' | 'skin_analysis';
}

/**
 * Response from image-based health analysis
 */
export interface ImageAnalysisResponse {
  /** Extracted data from images (e.g., biomarker values from blood test) */
  extractedData?: Record<string, unknown>;
  /** AI-generated summary of findings */
  summary: string;
  /** Key observations from the images */
  observations: string[];
  /** Potential concerns flagged */
  concerns: string[];
  /** Recommended next steps */
  recommendations: string[];
  /** Confidence level of the analysis */
  confidence: 'high' | 'medium' | 'low';
  /** Provider metadata */
  tokensUsed: number;
  modelVersion: string;
}

/**
 * Request for comprehensive report generation
 */
export interface ReportGenerationRequest {
  /** Form intake data */
  intakeData?: AIAnalysisRequest['intakeData'];
  /** Blood test results */
  bloodTestResults?: AIAnalysisRequest['bloodTestResults'];
  /** User demographics */
  userAge?: number;
  userGender?: AIAnalysisRequest['userGender'];
  /** Images to include in analysis */
  images?: ImageInput[];
  /** Documents to include in analysis */
  documents?: DocumentInput[];
  /** Report type */
  reportType: 'comprehensive' | 'focused' | 'follow_up';
  /** Specific focus areas */
  focusAreas?: string[];
}

/**
 * Comprehensive health report response
 */
export interface ReportGenerationResponse {
  /** Executive summary */
  executiveSummary: string;
  /** Detailed health overview */
  healthOverview: string;
  /** Key findings */
  keyFindings: Array<{
    category: string;
    finding: string;
    significance: 'high' | 'medium' | 'low';
  }>;
  /** Recommendations */
  recommendations: Array<{
    category: string;
    recommendation: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    rationale: string;
  }>;
  /** Areas to monitor */
  monitoringPoints: string[];
  /** Risk factors identified */
  riskFactors: string[];
  /** Positive indicators */
  positiveIndicators: string[];
  /** Suggested follow-up actions */
  followUpActions: string[];
  /** Disclaimers */
  disclaimers: string[];
  /** Metadata */
  tokensUsed: number;
  modelVersion: string;
  generatedAt: string;
}

/**
 * Base interface for AI service providers
 * Enables switching between different AI providers (GLM, Anthropic, OpenAI, etc.)
 * via the factory pattern without changing application code
 */
export interface IAIService {
  /**
   * Analyze health data and generate recommendations
   * @param request - Health data for analysis
   * @returns AI-generated health summary and recommendations
   */
  analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;

  /**
   * Generate explanation for health topics
   * @param topic - The topic to explain
   * @param context - Additional context for the explanation
   * @returns Educational explanation text
   */
  generateExplanation(
    topic: string,
    context: Record<string, unknown>
  ): Promise<string>;

  /**
   * Analyze images for health-related insights
   * @param request - Image analysis request
   * @returns AI-generated image analysis
   */
  analyzeImage?(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse>;

  /**
   * Generate comprehensive health report
   * @param request - Report generation request
   * @returns Comprehensive health report
   */
  generateReport?(request: ReportGenerationRequest): Promise<ReportGenerationResponse>;

  /**
   * Check if provider supports image analysis
   * @returns True if provider supports vision/image analysis
   */
  supportsImageAnalysis?(): boolean;

  /**
   * Get the name of the AI provider
   * @returns Provider name (e.g., 'glm', 'anthropic', 'openai')
   */
  getProviderName(): string;

  /**
   * Get the AI model version being used
   * @returns Model version identifier
   */
  getModelVersion(): string;
}
