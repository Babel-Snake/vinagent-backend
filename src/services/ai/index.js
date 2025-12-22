const OpenAIAdapter = require('./openai.adapter');

const logger = require('../../config/logger');

// Factory to get the configured provider
function getAIService() {
    const provider = process.env.AI_PROVIDER || 'openai';
    const apiKey = process.env.OPENAI_API_KEY; // Extend for other providers later
    const model = process.env.AI_MODEL || 'gpt-4o-mini';
    const skip = process.env.AI_SKIP === 'true';

    if (skip || !apiKey) {
        logger.warn(skip ? 'AI Service explicitly skipped via AI_SKIP.' : '⚠️ No API Key found for AI Service. Using Mock Adapter.');
        return new MockAdapter();
    }

    switch (provider) {
        case 'openai':
            return new OpenAIAdapter(apiKey, model);
        default:
            logger.warn(`Unknown AI Provider: ${provider}. Defaulting to OpenAI.`);
            return new OpenAIAdapter(apiKey, model);
    }
}

// Simple Mock Adapter for dev/test without keys
class MockAdapter {
    async classify(text) {
        return {
            category: 'GENERAL',
            subType: 'GENERAL_ENQUIRY',
            sentiment: 'NEUTRAL',
            priority: 'normal',
            summary: 'AI Service Mock: ' + text.substring(0, 50),
            suggestedTitle: 'Mock Task'
        };
    }
    async generate() { return "Mock response"; }
}

module.exports = getAIService();
