import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
} from '../../../types/index.js';

/**
 * Base interface for AI service providers
 * Enables switching between different AI providers (GLM, Anthropic, etc.)
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
   * Get the name of the AI provider
   * @returns Provider name (e.g., 'glm', 'anthropic')
   */
  getProviderName(): string;

  /**
   * Get the AI model version being used
   * @returns Model version identifier
   */
  getModelVersion(): string;
}
