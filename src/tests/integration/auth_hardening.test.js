const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Winery } = require('../../models');

describe('Auth Hardening Integration', () => {
    let winery;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        winery = await Winery.create({
            name: 'Auth Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'auth@test.com'
        });

        // Ensure bypass is DISABLED initially to test enforcement
        process.env.ALLOW_TEST_AUTH_BYPASS = 'false';
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('Test Mode Bypass', () => {
        it('should REJECT mock-token when bypass is disabled', async () => {
            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(401); // UNAUTHENTICATED or 403?
            // Middleware returns 401 if verifyIdToken fails (unless caught)
            // If bypass is off, it tries verifyIdToken('mock-token') which fails.
            expect(res.body.error.code).toBe('UNAUTHENTICATED');
        });

        it('should ACCEPT mock-token when bypass is enabled', async () => {
            process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

            // Allow time for bypass logic (if any caching, but env is immediate)

            // Need to ensure the stub user exists for the mock logic
            await User.create({
                email: 'stub@example.com',
                role: 'manager',
                wineryId: winery.id,
                firebaseUid: 'stub-uid'
            });

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(200);
        });
    });

    describe('Token Validation', () => {
        it('should REJECT malformed token', async () => {
            // Bypass disabled for this test?
            // If bypass enabled, it only catches 'mock-token'.
            // Anything else goes to verifyIdToken.

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer invalid-token-structure');

            expect(res.status).toBe(401);
            expect(res.body.error.message).toMatch(/Invalid or expired token/);
        });
    });

    // TODO: Role checks integration test (requires different users)
});
