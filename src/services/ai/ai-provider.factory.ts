import logger from '../../utils/logger.js';
import type { IAIService } from './providers/base-ai-provider.interface.js';
import { OpenAIProvider } from './providers/openai.provider.js';

/**
 * AI Provider Factory
 * OpenAI-only provider accessor
 */
export class AIProviderFactory {
  private static instance: IAIService | null = null;

  /**
    * Get the configured AI provider instance
    * Creates singleton instance on first call
    * @returns AI service provider implementation
    */
  static getProvider(): IAIService {
    if (!this.instance) {
      logger.info('Initializing AI provider: openai');
      this.instance = new OpenAIProvider();

      logger.info(
        `AI provider initialized: ${this.instance.getProviderName()} (${this.instance.getModelVersion()})`
      );
    }

    return this.instance as IAIService;
  }

  /**
   * Reset the factory instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Get current provider type without initializing
   * @returns Provider type from config
   */
  static getProviderType(): string {
    return 'openai';
  }
}

export default AIProviderFactory;
