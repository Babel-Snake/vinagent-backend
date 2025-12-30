// src/tests/integration/auth_hardening.test.js
// Tests for authentication hardening and bypass controls

process.env.NODE_ENV = 'test';

const request = require('supertest');

describe('Auth Hardening Integration', () => {
    let sequelize, User, Winery, app, winery;

    beforeAll(async () => {
        // Start with bypass disabled
        process.env.ALLOW_TEST_AUTH_BYPASS = 'false';

        // Import models and app
        const models = require('../../models');
        sequelize = models.sequelize;
        User = models.User;
        Winery = models.Winery;
        app = require('../../app');

        await sequelize.sync({ force: true });

        winery = await Winery.create({
            name: 'Auth Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'auth@test.com'
        });

        // Create stub user upfront
        await User.create({
            email: 'stub@example.com',
            role: 'manager',
            wineryId: winery.id,
            firebaseUid: 'stub-uid'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('Test Mode Bypass', () => {
        it('should REJECT mock-token when bypass is disabled', async () => {
            process.env.ALLOW_TEST_AUTH_BYPASS = 'false';

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHENTICATED');
        });

        it('should ACCEPT mock-token when bypass is enabled and user exists', async () => {
            // Enable bypass
            process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(200);
        });
    });

    describe('Token Validation', () => {
        it('should REJECT malformed token', async () => {
            // With bypass enabled, only 'mock-token' is caught
            // Anything else goes to Firebase verifyIdToken
            process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer invalid-token-structure');

            expect(res.status).toBe(401);
            expect(res.body.error.message).toMatch(/Invalid or expired token/);
        });
    });

    describe('Role Enforcement', () => {
        it('placeholder for role-based tests', () => {
            // Role enforcement is tested more thoroughly in task.routes.test.js
            expect(true).toBe(true);
        });
    });
});
