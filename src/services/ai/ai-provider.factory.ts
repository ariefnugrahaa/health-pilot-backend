import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import type { IAIService } from './providers/base-ai-provider.interface.js';
import { GLMProvider } from './providers/glm.provider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { MockProvider } from './providers/mock.provider.js';

/**
 * AI Provider Factory
 * Returns the appropriate AI service provider based on configuration
 * Enables switching between providers via environment variable without code changes
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
      const providerType = config.ai.provider.toLowerCase();

      logger.info(`Initializing AI provider: ${providerType}`);

      switch (providerType) {
        case 'glm':
          this.instance = new GLMProvider();
          break;
        case 'anthropic':
          this.instance = new AnthropicProvider();
          break;
        case 'openai':
          this.instance = new OpenAIProvider();
          break;
        case 'mock':
          this.instance = new MockProvider();
          break;
        default:
          logger.error(`Unsupported AI provider configured: ${providerType}`);
          throw new Error(
            `Unsupported AI provider: ${providerType}. Valid options: 'glm', 'anthropic', 'openai', 'mock'`
          );
      }

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
    return config.ai.provider;
  }
}

export default AIProviderFactory;
