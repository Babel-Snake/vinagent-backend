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

    if (skip) {
        logger.warn('AI Service explicitly skipped via AI_SKIP; using deterministic heuristic adapter.');
        return new MockAdapter();
    }

    if (!apiKey) {
        if (process.env.NODE_ENV === 'production') {
            const error = new Error('OPENAI_API_KEY is required in production unless AI_SKIP=true.');
            error.code = 'AI_CONFIGURATION_ERROR';
            throw error;
        }
        logger.warn('No API key found for AI Service. Using deterministic heuristic adapter outside production.');
        return new MockAdapter();
    }

    switch (provider) {
        case 'openai':
            return new OpenAIAdapter(apiKey, model);
        default:
            {
                const error = new Error(`Unknown AI provider '${provider}'.`);
                error.code = 'AI_CONFIGURATION_ERROR';
                throw error;
            }
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
