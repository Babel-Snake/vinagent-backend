const OpenAIAdapter = require('./openai.adapter');

const logger = require('../../config/logger');
const { classifyMessageHeuristically } = require('../taskClassificationHeuristics');

// Factory to get the configured provider
function getAIService() {
    const provider = process.env.AI_PROVIDER || 'openai';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.AI_MODEL || 'gpt-4o-mini';
    const skip = process.env.AI_SKIP === 'true';
    const forceMockInTests = process.env.NODE_ENV === 'test' && process.env.AI_ALLOW_LIVE_TESTS !== 'true';

    if (forceMockInTests) {
        logger.info('AI Service using deterministic Mock Adapter in test mode.');
        return new MockAdapter();
    }

    if (skip || !apiKey) {
        logger.warn(skip ? 'AI Service explicitly skipped via AI_SKIP.' : 'No API key found for AI Service. Using Mock Adapter.');
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

class MockAdapter {
    async classify(text, context = {}) {
        return classifyMessageHeuristically(text, context);
    }

    async generate(prompt, context = {}) {
        const result = await this.classify(prompt, context);
        return result.suggestedReply || 'Thanks for reaching out. The team will follow up shortly.';
    }
}

module.exports = getAIService();
