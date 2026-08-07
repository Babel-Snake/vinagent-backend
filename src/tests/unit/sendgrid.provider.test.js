describe('SendGrid notification provider', () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY
    };

    function restoreEnv() {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
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

    test('uses mock email outside production when credentials are incomplete', async () => {
        process.env.NODE_ENV = 'test';
        delete process.env.SENDGRID_API_KEY;
        mockLogger();

        const provider = require('../../services/notifications/providers/sendgrid.provider');
        const result = await provider.sendEmail({
            to: 'guest@example.com',
            from: 'winery@example.com',
            subject: 'Hello',
            text: 'Welcome'
        });

        expect(result.provider).toBe('sendgrid');
        expect(result.id).toMatch(/^mock-email-/);
    });

    test('fails closed in production when credentials are incomplete', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.SENDGRID_API_KEY;
        mockLogger();

        const provider = require('../../services/notifications/providers/sendgrid.provider');

        await expect(provider.sendEmail({
            to: 'guest@example.com',
            from: 'winery@example.com',
            subject: 'Hello',
            text: 'Welcome'
        })).rejects.toMatchObject({ code: 'SENDGRID_NOT_CONFIGURED' });
    });

    test('sends through SendGrid when credentials are configured', async () => {
        process.env.NODE_ENV = 'production';
        process.env.SENDGRID_API_KEY = 'sendgrid-key';
        mockLogger();

        const post = jest.fn().mockResolvedValue({ status: 202, headers: { 'x-message-id': 'SG123' } });
        jest.doMock('axios', () => ({ post }));

        const provider = require('../../services/notifications/providers/sendgrid.provider');
        const result = await provider.sendEmail({
            to: 'guest@example.com',
            from: 'winery@example.com',
            subject: 'Hello',
            text: 'Welcome'
        });

        expect(post).toHaveBeenCalledWith(
            'https://api.sendgrid.com/v3/mail/send',
            expect.objectContaining({ subject: 'Hello' }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sendgrid-key' }) })
        );
        expect(result).toMatchObject({ id: 'SG123', status: 'queued', provider: 'sendgrid' });
    });
});
