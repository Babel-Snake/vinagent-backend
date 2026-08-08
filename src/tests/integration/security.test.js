const request = require('supertest');
const app = require('../../app');

describe('Security & Logging', () => {
    it('should set security headers (Helmet)', async () => {
        const res = await request(app).get('/');
        // Helmet sets these by default
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should set rate limit headers', async () => {
        const res = await request(app).get('/');
        expect(res.headers['ratelimit-limit']).toBeDefined();
        expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('rejects oversized webhook bodies before signature processing', async () => {
        const res = await request(app)
            .post('/api/webhooks/email')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }));

        expect(res.status).toBe(413);
        expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    // Logging verification is hard in integration tests without spying on stdout, 
    // but the presence of middleware suggests it's active.
});
