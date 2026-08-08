process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.PIN_SESSION_SECRET = 'pin-auth-test-secret';
process.env.RESOLVE_STAFF_RATE_LIMIT_MAX = '2';
process.env.DEPLOYMENT_WINERY_ID = '1';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, WinerySettings, User } = require('../../models');
const { hashPin } = require('../../utils/pinAuth');

describe('PIN Auth Routes', () => {
    let winery, otherWinery;

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        winery = await Winery.create({
            id: 1,
            name: 'PIN Route Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'pin@example.com'
        });

        otherWinery = await Winery.create({
            id: 2,
            name: 'Other Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'other-pin@example.com'
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
            username: 'staffpin',
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

        await User.create({
            firebaseUid: 'other-staff-pin-uid',
            email: 'other.pin@example.com',
            username: 'otherpin',
            displayName: 'Other Staff PIN',
            role: 'staff',
            wineryId: otherWinery.id,
            pinHash: hashPin('9988'),
            pinUpdatedAt: new Date()
        });
    });

    afterAll(async () => {
        delete process.env.DEPLOYMENT_WINERY_ID;
        await sequelize.close();
    });

    it('returns the public PIN configuration for a winery', async () => {
        const res = await request(app)
            .get('/api/public/pin-config')
            .query({ wineryId: otherWinery.id })
            .expect(200);

        expect(res.body.pinLoginEnabled).toBe(true);
        expect(res.body.allowManagerBasicPin).toBe(true);
        expect(res.body.pinIdleTimeoutSeconds).toBe(120);
        expect(res.body.wineryName).toBe('PIN Route Test Winery');
    });

    it('resolves immutable staff usernames only inside the deployment winery', async () => {
        await User.update({ displayName: 'Renamed Staff Member' }, { where: { username: 'staffpin' } });

        const resolved = await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'staffpin' })
            .expect(200);

        expect(resolved.body).toEqual({
            email: 'staff.pin@example.com',
            wineryId: winery.id
        });

        await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'otherpin' })
            .expect(404);

        const limited = await request(app)
            .get('/api/public/resolve-staff')
            .query({ username: 'Missing Staff' })
            .expect(429);

        expect(limited.body.error).toMatch(/too many staff resolution attempts/i);
    });

    it('ignores a client-supplied winery ID during PIN login', async () => {
        const res = await request(app)
            .post('/api/public/pin-login')
            .send({ wineryId: otherWinery.id, pin: '9988' })
            .expect(401);

        expect(res.body.error.code).toBe('INVALID_PIN');
    });

    it('rejects winery and login-identity changes through ordinary manager APIs', async () => {
        const createAttempt = await request(app)
            .post('/api/staff')
            .set('Authorization', 'Bearer mock-token')
            .send({ username: 'movedstaff', password: 'password1', wineryId: otherWinery.id })
            .expect(400);

        expect(createAttempt.body.error.code).toBe('IMMUTABLE_WINERY');

        const staff = await User.findOne({ where: { username: 'staffpin' } });
        const updateAttempt = await request(app)
            .put(`/api/staff/${staff.id}`)
            .set('Authorization', 'Bearer mock-token')
            .send({ email: 'replacement@example.com', wineryId: otherWinery.id })
            .expect(400);

        expect(updateAttempt.body.error.code).toBe('IMMUTABLE_STAFF_IDENTITY');

        const profileAttempt = await request(app)
            .patch('/api/public/me')
            .set('Authorization', 'Bearer mock-token')
            .send({ wineryId: otherWinery.id })
            .expect(400);

        expect(profileAttempt.body.error.code).toBe('IMMUTABLE_WINERY');
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
