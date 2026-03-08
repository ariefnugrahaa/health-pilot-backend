import { IAIService } from './base-ai-provider.interface.js';
import { AIAnalysisRequest, AIAnalysisResponse, NextStepRecommendation } from '../../../types/index.js';

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
            nextSteps: this.getDefaultNextSteps(),
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

    private getDefaultNextSteps(): NextStepRecommendation[] {
        return [
            {
                id: 'mock-track-sleep',
                title: 'Track Sleep and Energy Patterns',
                description: '[MOCK] Monitor your sleep quality and energy levels throughout the day to identify patterns and potential triggers affecting your wellbeing.',
                effortLevel: 'LOW',
                icon: 'sleep',
                whatHappensNext: 'You\'ll log your sleep and energy daily. After 1-2 weeks, patterns emerge that reveal triggers and help guide next steps.',
            },
            {
                id: 'mock-food-triggers',
                title: 'Explore Food and Digestive Triggers',
                description: '[MOCK] Identify foods that may be affecting your health by tracking what you eat and how you feel afterward.',
                effortLevel: 'MODERATE',
                icon: 'food',
                whatHappensNext: 'You\'ll try an elimination approach, removing common trigger foods. Results typically show in 2-4 weeks.',
            },
            {
                id: 'mock-consult-provider',
                title: 'Consult a Healthcare Provider',
                description: '[MOCK] Speak with a qualified healthcare professional who can provide personalized medical advice and run appropriate tests.',
                effortLevel: 'HIGH',
                icon: 'doctor',
                whatHappensNext: 'A provider can run blood tests, diagnose conditions, and prescribe treatments if needed. They can also refer you to specialists.',
            },
        ];
    }
}
