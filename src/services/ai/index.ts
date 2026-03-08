// AI Services - Unified exports
export { AIProviderFactory } from './ai-provider.factory.js';
export { reportGenerationService, ReportGenerationService } from './report-generation.service.js';

// Provider implementations
export { AnthropicProvider } from './providers/anthropic.provider.js';
export { GLMProvider } from './providers/glm.provider.js';
export { OpenAIProvider } from './providers/openai.provider.js';
export { MockProvider } from './providers/mock.provider.js';

// Types
export type {
  IAIService,
  ImageInput,
  DocumentInput,
  ImageAnalysisRequest,
  ImageAnalysisResponse,
  ReportGenerationRequest,
  ReportGenerationResponse,
} from './providers/base-ai-provider.interface.js';
