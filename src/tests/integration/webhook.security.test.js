const request = require('supertest');
const crypto = require('crypto');

// Note: We need to mock the validation middleware to force failures,
// OR we can test the real middleware if we set headers incorrectly.
// Since actual signature validation involves cryptographic secrets, 
// checking "missing header" or "bad signature" with real middleware is 
// strictly integration testing.
// However, preventing middleware mocking requires re-loading app.
// Let's try to send requests without proper headers and expect failure.

describe('Webhook Security Integration', () => {

    const OLD_ENV = process.env;

    beforeAll(() => {
        jest.resetModules(); // This is crucial to reload config/middleware with new env
        process.env = {
            ...OLD_ENV,
            TWILIO_AUTH_TOKEN: 'mock-auth-token',
            EMAIL_WEBHOOK_SECRET: 'mock-email-secret',
            RETELL_API_KEY: '',
            RETELL_WEBHOOK_SECRET: 'mock-retell-secret'
        };
        // Re-require to pick up env
        // actually app is already required. We might need to handle this carefully.
        // But webhookValidation.js reads config at runtime or load time?
        // It reads `const config = require('../config')` at top level.
        // config reads process.env at top level.
        // So standard jest technique is strictly resetting modules.
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    // Helper to get fresh app instance
    async function getApp() {
        jest.resetModules();
        process.env.TWILIO_AUTH_TOKEN = 'mock-auth-token';
        process.env.EMAIL_WEBHOOK_SECRET = 'mock-email-secret';
        process.env.RETELL_API_KEY = '';
        process.env.RETELL_WEBHOOK_SECRET = 'mock-retell-secret';
        process.env.NODE_ENV = 'test';
        return require('../../app');
    }

    function signRetellPayload(payload, timestamp = Date.now()) {
        const digest = crypto
            .createHmac('sha256', 'mock-retell-secret')
            .update(payload)
            .update(String(timestamp))
            .digest('hex');
        return `v=${timestamp},d=${digest}`;
    }

    // We expect these checks to be enabled in app.
    // src/routes/webhook.routes.js applies validateTwilioSignature etc.

    it('should reject SMS webhook without Twilio Signature', async () => {
        const app = await getApp();
        const res = await request(app)
            .post('/api/webhooks/sms')
            .send({
                From: '+15551234567',
                To: '+15557654321',
                Body: 'Test Message',
                MessageSid: 'SM12345'
            }); // Valid body, Missing header

        // Should be 403 because TWILIO_AUTH_TOKEN is present, enforcing check
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Missing signature');
    });

    it('should reject Voice webhook without Twilio Signature', async () => {
        const app = await getApp();
        const res = await request(app)
            .post('/api/webhooks/voice')
            .send({
                From: '+15551234567',
                To: '+15557654321',
                CallSid: 'CA12345',
                RecordingUrl: 'http://ex.com'
            });

        expect(res.status).toBe(403);
    });

    it('should reject Email webhook without proper signature', async () => {
        const app = await getApp();
        const res = await request(app)
            .post('/api/webhooks/email')
            .send({
                from: 'a@b.com',
                to: 'c@d.com',
                subject: 'S',
                text: 'T',
                messageId: 'M1'
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Missing signature');
    });

    it('should reject Retell webhook without proper signature', async () => {
        const app = await getApp();
        const res = await request(app)
            .post('/api/webhooks/retell')
            .send({ event_type: 'call_analyzed' });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Missing signature');
    });

    it('should fail closed when the Retell verification key is not configured', async () => {
        const app = await getApp();
        process.env.RETELL_API_KEY = '';
        process.env.RETELL_WEBHOOK_SECRET = '';

        try {
            const res = await request(app)
                .post('/api/webhooks/retell')
                .send({ event_type: 'call_analyzed' });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Server configuration error');
        } finally {
            process.env.RETELL_WEBHOOK_SECRET = 'mock-retell-secret';
        }
    });

    it('should accept Retell webhook with valid signature', async () => {
        const app = await getApp();
        const payload = { event_type: 'call_analyzed' };
        const signature = signRetellPayload(JSON.stringify(payload));

        const res = await request(app)
            .post('/api/webhooks/retell')
            .set('x-retell-signature', signature)
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should validate Retell signatures against the exact raw request body', async () => {
        const app = await getApp();
        const rawPayload = '{ "event_type": "call_analyzed", "call": { "id": "abc" } }';
        const signature = signRetellPayload(rawPayload);

        const res = await request(app)
            .post('/api/webhooks/retell')
            .set('content-type', 'application/json')
            .set('x-retell-signature', signature)
            .send(rawPayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should reject the legacy digest-only Retell signature format', async () => {
        const app = await getApp();
        const payload = JSON.stringify({ event_type: 'call_analyzed' });
        const legacySignature = crypto
            .createHmac('sha256', 'mock-retell-secret')
            .update(payload)
            .digest('hex');

        const res = await request(app)
            .post('/api/webhooks/retell')
            .set('content-type', 'application/json')
            .set('x-retell-signature', legacySignature)
            .send(payload);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Invalid signature');
    });

    it('should reject Retell signatures older than the five-minute replay window', async () => {
        const app = await getApp();
        const payload = JSON.stringify({ event_type: 'call_analyzed' });
        const staleTimestamp = Date.now() - (5 * 60 * 1000) - 1;

        const res = await request(app)
            .post('/api/webhooks/retell')
            .set('content-type', 'application/json')
            .set('x-retell-signature', signRetellPayload(payload, staleTimestamp))
            .send(payload);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Invalid or expired signature');
    });

});
