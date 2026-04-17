describe('AI service hardening', () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        AI_ALLOW_LIVE_TESTS: process.env.AI_ALLOW_LIVE_TESTS,
        AI_SKIP: process.env.AI_SKIP
    };

    afterEach(() => {
        jest.resetModules();

        if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnv.NODE_ENV;

        if (originalEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;

        if (originalEnv.AI_ALLOW_LIVE_TESTS === undefined) delete process.env.AI_ALLOW_LIVE_TESTS;
        else process.env.AI_ALLOW_LIVE_TESTS = originalEnv.AI_ALLOW_LIVE_TESTS;

        if (originalEnv.AI_SKIP === undefined) delete process.env.AI_SKIP;
        else process.env.AI_SKIP = originalEnv.AI_SKIP;
    });

    test('uses the deterministic mock adapter in test mode even when an API key exists', async () => {
        process.env.NODE_ENV = 'test';
        process.env.OPENAI_API_KEY = 'test-key';
        delete process.env.AI_ALLOW_LIVE_TESTS;
        delete process.env.AI_SKIP;

        const aiService = require('../../services/ai');
        const result = await aiService.classify('I want to order wine', { suggestedChannel: 'sms' });

        expect(aiService.constructor.name).toBe('MockAdapter');
        expect(result.category).toBe('ORDER');
        expect(result.subType).toBe('ORDER_GENERAL_ENQUIRY');
        expect(result.suggestedSteps.length).toBeGreaterThan(0);
        expect(result.suggestedReply).toMatch(/order enquiry/i);
    });

    test('allows the live adapter in test mode only when explicitly opted in', () => {
        process.env.NODE_ENV = 'test';
        process.env.OPENAI_API_KEY = 'test-key';
        process.env.AI_ALLOW_LIVE_TESTS = 'true';
        delete process.env.AI_SKIP;

        const aiService = require('../../services/ai');

        expect(aiService.constructor.name).toBe('OpenAIAdapter');
    });
});
