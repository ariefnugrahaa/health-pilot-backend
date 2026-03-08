import { AIProviderFactory } from './ai-provider.factory.js';
import type {
  ImageAnalysisRequest,
  ImageAnalysisResponse,
  ReportGenerationRequest,
  ReportGenerationResponse,
} from './providers/base-ai-provider.interface.js';
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  HealthIntakeData,
  BloodTestResult,
} from '../../types/index.js';
import logger from '../../utils/logger.js';

/**
 * Report Generation Service
 * High-level service for generating health reports from various data sources
 */
export class ReportGenerationService {
  /**
   * Generate health report from form intake data
   */
  async generateIntakeReport(
    intakeData: HealthIntakeData,
    options?: {
      userAge?: number;
      userGender?: AIAnalysisRequest['userGender'];
      bloodTestResults?: BloodTestResult[];
    }
  ): Promise<AIAnalysisResponse> {
    const provider = AIProviderFactory.getProvider();

    logger.info('Generating intake report', {
      hasBloodTestResults: !!options?.bloodTestResults?.length,
      provider: provider.getProviderName(),
    });

    const request: AIAnalysisRequest = { intakeData };
    if (options?.userAge !== undefined) request.userAge = options.userAge;
    if (options?.userGender !== undefined) request.userGender = options.userGender;
    if (options?.bloodTestResults !== undefined) {
      request.bloodTestResults = options.bloodTestResults;
    }

    return provider.analyzeHealth(request);
  }

  /**
   * Analyze blood test images and extract data
   */
  async analyzeBloodTestImages(
    images: ImageAnalysisRequest['images'],
    context?: ImageAnalysisRequest['context']
  ): Promise<ImageAnalysisResponse> {
    const provider = AIProviderFactory.getProvider();

    if (!provider.supportsImageAnalysis?.()) {
      throw new Error('Current AI provider does not support image analysis');
    }

    logger.info('Analyzing blood test images', {
      imageCount: images.length,
      provider: provider.getProviderName(),
    });

    const request: ImageAnalysisRequest = {
      images,
      analysisType: 'blood_test',
    };
    if (context !== undefined) request.context = context;

    return provider.analyzeImage!(request);
  }

  /**
   * Analyze medical document images
   */
  async analyzeMedicalDocument(
    images: ImageAnalysisRequest['images'],
    context?: ImageAnalysisRequest['context']
  ): Promise<ImageAnalysisResponse> {
    const provider = AIProviderFactory.getProvider();

    if (!provider.supportsImageAnalysis?.()) {
      throw new Error('Current AI provider does not support image analysis');
    }

    logger.info('Analyzing medical document', {
      imageCount: images.length,
      provider: provider.getProviderName(),
    });

    const request: ImageAnalysisRequest = {
      images,
      analysisType: 'medical_document',
    };
    if (context !== undefined) request.context = context;

    return provider.analyzeImage!(request);
  }

  /**
   * Analyze skin images (for dermatology-related concerns)
   */
  async analyzeSkinImages(
    images: ImageAnalysisRequest['images'],
    context?: ImageAnalysisRequest['context']
  ): Promise<ImageAnalysisResponse> {
    const provider = AIProviderFactory.getProvider();

    if (!provider.supportsImageAnalysis?.()) {
      throw new Error('Current AI provider does not support image analysis');
    }

    logger.info('Analyzing skin images', {
      imageCount: images.length,
      provider: provider.getProviderName(),
    });

    const request: ImageAnalysisRequest = {
      images,
      analysisType: 'skin_analysis',
    };
    if (context !== undefined) request.context = context;

    return provider.analyzeImage!(request);
  }

  /**
   * Generate comprehensive health report from multiple data sources
   */
  async generateComprehensiveReport(
    request: ReportGenerationRequest
  ): Promise<ReportGenerationResponse> {
    const provider = AIProviderFactory.getProvider();

    if (!provider.generateReport) {
      // Fallback: combine basic analysis into a report format
      return this.generateReportFromBasicAnalysis(request);
    }

    logger.info('Generating comprehensive report', {
      reportType: request.reportType,
      hasIntakeData: !!request.intakeData,
      hasBloodTestResults: !!request.bloodTestResults?.length,
      hasImages: !!request.images?.length,
      hasDocuments: !!request.documents?.length,
      provider: provider.getProviderName(),
    });

    return provider.generateReport(request);
  }

  /**
   * Generate focused report for specific health concerns
   */
  async generateFocusedReport(
    intakeData: HealthIntakeData,
    focusAreas: string[],
    options?: {
      userAge?: number;
      userGender?: AIAnalysisRequest['userGender'];
      bloodTestResults?: BloodTestResult[];
      images?: ReportGenerationRequest['images'];
    }
  ): Promise<ReportGenerationResponse> {
    const request: ReportGenerationRequest = {
      intakeData,
      focusAreas,
      reportType: 'focused',
    };
    if (options?.userAge !== undefined) request.userAge = options.userAge;
    if (options?.userGender !== undefined) request.userGender = options.userGender;
    if (options?.bloodTestResults !== undefined) {
      request.bloodTestResults = options.bloodTestResults;
    }
    if (options?.images !== undefined) request.images = options.images;

    return this.generateComprehensiveReport(request);
  }

  /**
   * Generate follow-up report comparing with previous data
   */
  async generateFollowUpReport(
    request: ReportGenerationRequest
  ): Promise<ReportGenerationResponse> {
    return this.generateComprehensiveReport({
      ...request,
      reportType: 'follow_up',
    });
  }

  /**
   * Check if current provider supports image analysis
   */
  supportsImageAnalysis(): boolean {
    const provider = AIProviderFactory.getProvider();
    return provider.supportsImageAnalysis?.() ?? false;
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { name: string; model: string } {
    const provider = AIProviderFactory.getProvider();
    return {
      name: provider.getProviderName(),
      model: provider.getModelVersion(),
    };
  }

  /**
   * Fallback: Generate report from basic analysis when provider doesn't support generateReport
   */
  private async generateReportFromBasicAnalysis(
    request: ReportGenerationRequest
  ): Promise<ReportGenerationResponse> {
    const provider = AIProviderFactory.getProvider();

    // Build analysis request conditionally
    const analysisRequest: AIAnalysisRequest = {
      intakeData: request.intakeData!,
    };
    if (request.bloodTestResults !== undefined) {
      analysisRequest.bloodTestResults = request.bloodTestResults;
    }
    if (request.userAge !== undefined) analysisRequest.userAge = request.userAge;
    if (request.userGender !== undefined) analysisRequest.userGender = request.userGender;

    // Perform basic health analysis
    const basicAnalysis = await provider.analyzeHealth(analysisRequest);

    // Convert to report format
    return {
      executiveSummary: basicAnalysis.healthSummary,
      healthOverview: basicAnalysis.healthSummary,
      keyFindings: basicAnalysis.warnings.map((w) => ({
        category: 'Health',
        finding: w,
        significance: 'medium' as const,
      })),
      recommendations: basicAnalysis.recommendations.map((r) => ({
        category: 'General',
        recommendation: r,
        priority: 'medium' as const,
        rationale: 'Based on health intake analysis',
      })),
      monitoringPoints: [],
      riskFactors: basicAnalysis.warnings,
      positiveIndicators: [],
      followUpActions: basicAnalysis.recommendations.slice(0, 3),
      disclaimers: [
        'This analysis is for educational purposes only.',
        'Always consult with a healthcare professional for medical decisions.',
      ],
      tokensUsed: basicAnalysis.tokensUsed,
      modelVersion: basicAnalysis.modelVersion,
      generatedAt: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const reportGenerationService = new ReportGenerationService();
export default reportGenerationService;
