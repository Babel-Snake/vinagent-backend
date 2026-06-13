process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.PIN_SESSION_SECRET = 'pin-auth-test-secret';
process.env.RESOLVE_STAFF_RATE_LIMIT_MAX = '2';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, WinerySettings, User } = require('../../models');
const { hashPin } = require('../../utils/pinAuth');

describe('PIN Auth Routes', () => {
    let winery;

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        winery = await Winery.create({
            id: 1,
            name: 'PIN Route Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'pin@example.com'
        });

        await WinerySettings.create({
            wineryId: winery.id,
            authConfig: {
                pinLoginEnabled: true,
                allowManagerBasicPin: true,
                pinIdleTimeoutSeconds: 120,
                pinSessionHours: 4,
                pinMaxAttempts: 5,
                pinLockoutMinutes: 5
            }
        });

        await User.create({
            id: 7,
            firebaseUid: 'stub-uid',
            email: 'stub@example.com',
            displayName: 'Stub Manager',
            role: 'manager',
            wineryId: winery.id
        });

        await User.create({
            firebaseUid: 'staff-pin-uid',
            email: 'staff.pin@example.com',
            displayName: 'Staff PIN',
            role: 'staff',
            wineryId: winery.id,
            pinHash: hashPin('4821'),
            pinUpdatedAt: new Date()
        });

        await User.create({
            firebaseUid: 'manager-pin-uid',
            email: 'manager.pin@example.com',
            displayName: 'Manager PIN',
            role: 'manager',
            wineryId: winery.id,
            pinHash: hashPin('MGR7'),
            pinUpdatedAt: new Date()
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('returns the public PIN configuration for a winery', async () => {
        const res = await request(app)
            .get('/api/public/pin-config')
            .query({ wineryId: winery.id })
            .expect(200);

        expect(res.body.pinLoginEnabled).toBe(true);
        expect(res.body.allowManagerBasicPin).toBe(true);
        expect(res.body.pinIdleTimeoutSeconds).toBe(120);
        expect(res.body.wineryName).toBe('PIN Route Test Winery');
    });

    it('rate-limits repeated public staff resolution attempts', async () => {
        await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'Missing Staff' })
            .expect(404);

        await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'Missing Staff' })
            .expect(404);

        const limited = await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'Missing Staff' })
            .expect(429);

        expect(limited.body.error).toMatch(/too many staff resolution attempts/i);
    });

    it('creates a staff PIN session that can fetch the current profile', async () => {
        const login = await request(app)
            .post('/api/public/pin-login')
            .send({ wineryId: winery.id, pin: '4821' })
            .expect(200);

        expect(login.body.token).toMatch(/^pin\./);
        expect(login.body.user.role).toBe('staff');
        expect(login.body.user.actualRole).toBe('staff');

        const profile = await request(app)
            .get('/api/public/me')
            .set('Authorization', `Bearer ${login.body.token}`)
            .expect(200);

        expect(profile.body.user.role).toBe('staff');
        expect(profile.body.user.isPinSession).toBe(true);
    });

    it('downgrades manager PIN sessions to staff-level access', async () => {
        const login = await request(app)
            .post('/api/public/pin-login')
            .send({ wineryId: winery.id, pin: 'MGR7' })
            .expect(200);

        expect(login.body.user.role).toBe('staff');
        expect(login.body.user.actualRole).toBe('manager');
        expect(login.body.user.authMode).toBe('pin_basic');

        await request(app)
            .get('/api/winery/full')
            .set('Authorization', `Bearer ${login.body.token}`)
            .expect(403);
    });

    it('rejects PIN login when winery PIN login is disabled', async () => {
        await WinerySettings.update(
            { authConfig: { pinLoginEnabled: false } },
            { where: { wineryId: winery.id } }
        );

        const res = await request(app)
            .post('/api/public/pin-login')
            .send({ wineryId: winery.id, pin: '4821' })
            .expect(403);

        expect(res.body.error.code).toBe('PIN_LOGIN_DISABLED');
    });
});
