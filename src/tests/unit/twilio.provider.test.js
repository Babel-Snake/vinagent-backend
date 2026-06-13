describe('Twilio notification provider', () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
    };

    function restoreEnv() {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }

    function clearTwilioEnv() {
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_PHONE_NUMBER;
    }

    function mockLogger() {
        jest.doMock('../../config/logger', () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }));
    }

    afterEach(() => {
        jest.resetModules();
        restoreEnv();
    });

    test('uses mock SMS outside production when credentials are incomplete', async () => {
        process.env.NODE_ENV = 'test';
        clearTwilioEnv();
        mockLogger();

        const provider = require('../../services/notifications/providers/twilio.provider');

        const result = await provider.sendSms('+15551234567', 'Hello');

        expect(result.provider).toBe('twilio');
        expect(result.sid).toMatch(/^mock-sid-/);
    });

    test('fails closed in production when credentials are incomplete', async () => {
        process.env.NODE_ENV = 'production';
        clearTwilioEnv();
        mockLogger();

        const provider = require('../../services/notifications/providers/twilio.provider');

        await expect(provider.sendSms('+15551234567', 'Hello')).rejects.toMatchObject({
            code: 'TWILIO_NOT_CONFIGURED'
        });
    });

    test('sends through Twilio when all credentials are configured', async () => {
        process.env.NODE_ENV = 'production';
        process.env.TWILIO_ACCOUNT_SID = 'AC123';
        process.env.TWILIO_AUTH_TOKEN = 'auth-token';
        process.env.TWILIO_PHONE_NUMBER = '+15550000000';
        mockLogger();

        const create = jest.fn().mockResolvedValue({ sid: 'SM123', status: 'queued' });
        const twilioFactory = jest.fn(() => ({ messages: { create } }));
        jest.doMock('twilio', () => twilioFactory);

        const provider = require('../../services/notifications/providers/twilio.provider');
        const result = await provider.sendSms('+15551234567', 'Hello');

        expect(twilioFactory).toHaveBeenCalledWith('AC123', 'auth-token');
        expect(create).toHaveBeenCalledWith({
            body: 'Hello',
            from: '+15550000000',
            to: '+15551234567'
        });
        expect(result.sid).toBe('SM123');
    });
});
