import { IAIService } from './base-ai-provider.interface.js';
import { AIAnalysisRequest, AIAnalysisResponse } from '../../../types/index.js';

export class MockProvider implements IAIService {
    async analyzeHealth(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { userAge, userGender } = request;

        return {
            healthSummary: `[MOCK] This is a simulated health summary for testing purposes. Based on your profile (Age: ${userAge || 'N/A'}, Gender: ${userGender || 'N/A'}), your lifestyle appears balanced. This mock response allows you to verify the UI flow without consuming API credits.`,
            recommendations: [
                "[MOCK] Consider maintaining your current exercise routine.",
                "[MOCK] Monitor your sleep quality as you reported simulation-induced fatigue.",
                "[MOCK] Consult a real healthcare provider for actionable advice."
            ],
            warnings: [
                "This is a MOCK response.",
                "Do not use for medical decisions."
            ],
            tokensUsed: 0,
            modelVersion: 'v1.0-mock',
            promptVersion: 'v1.0'
        };
    }

    async generateExplanation(topic: string, _context: Record<string, unknown>): Promise<string> {
        return `[MOCK] This is a mock explanation for "${topic}".`;
    }

    getProviderName(): string {
        return 'mock';
    }

    getModelVersion(): string {
        return 'v1.0-mock';
    }
}
