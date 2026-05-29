describe('pinAuth secret hardening', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('rejects missing or weak production PIN session secrets', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.PIN_SESSION_SECRET;
        delete process.env.SESSION_SECRET;

        const { assertPinSessionSecret } = require('../../utils/pinAuth');
        expect(() => assertPinSessionSecret()).toThrow(/required in production/i);

        process.env.PIN_SESSION_SECRET = 'short-secret';
        expect(() => assertPinSessionSecret()).toThrow(/at least 32 characters/i);
    });

    it('accepts a strong production PIN session secret', () => {
        process.env.NODE_ENV = 'production';
        process.env.PIN_SESSION_SECRET = 'a-strong-production-pin-session-secret';

        const { assertPinSessionSecret } = require('../../utils/pinAuth');
        expect(() => assertPinSessionSecret()).not.toThrow();
    });
});
