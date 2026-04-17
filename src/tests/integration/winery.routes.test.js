process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const request = require('supertest');
const app = require('../../app');
const {
    sequelize,
    Winery,
    User,
    WineryBookingsConfig,
    WineryPolicyProfile,
    WineryIntegrationConfig,
    WineryBookingType
} = require('../../models');

describe('Winery Routes', () => {
    const authToken = 'Bearer mock-token';

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        await Winery.create({
            id: 1,
            name: 'Winery Route Test',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'winery@example.com'
        });

        await User.create({
            id: 7,
            firebaseUid: 'stub-uid',
            email: 'stub@example.com',
            displayName: 'Stub Manager',
            role: 'manager',
            wineryId: 1
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should update winery section profiles using the current route names', async () => {
        await request(app)
            .put('/api/winery/bookings-config')
            .set('Authorization', authToken)
            .send({
                walkInsAllowed: false,
                groupBookingThreshold: 12,
                defaultResponseStrategy: 'create_task'
            })
            .expect(200);

        await request(app)
            .put('/api/winery/policy-profile')
            .set('Authorization', authToken)
            .send({
                shippingTimeframesText: 'Ships in 3-5 business days',
                wineClubSummary: 'Quarterly club releases'
            })
            .expect(200);

        await request(app)
            .put('/api/winery/integration-config')
            .set('Authorization', authToken)
            .send({
                smsProvider: 'twilio',
                emailProvider: 'sendgrid',
                bookingProvider: 'nowbookit'
            })
            .expect(200);

        const bookingsConfig = await WineryBookingsConfig.findOne({ where: { wineryId: 1 } });
        const policyProfile = await WineryPolicyProfile.findOne({ where: { wineryId: 1 } });
        const integrationConfig = await WineryIntegrationConfig.findOne({ where: { wineryId: 1 } });

        expect(bookingsConfig.walkInsAllowed).toBe(false);
        expect(bookingsConfig.groupBookingThreshold).toBe(12);
        expect(policyProfile.shippingTimeframesText).toBe('Ships in 3-5 business days');
        expect(policyProfile.wineClubSummary).toBe('Quarterly club releases');
        expect(integrationConfig.smsProvider).toBe('twilio');
        expect(integrationConfig.bookingProvider).toBe('nowbookit');
    });

    it('should create and delete booking types through the winery routes', async () => {
        const createRes = await request(app)
            .post('/api/winery/bookings/types')
            .set('Authorization', authToken)
            .send({
                name: 'Estate Tasting',
                description: 'Hosted seated tasting',
                priceCents: 4500
            })
            .expect(201);

        expect(createRes.body.success).toBe(true);
        expect(createRes.body.data.name).toBe('Estate Tasting');

        const bookingTypeId = createRes.body.data.id;
        const storedType = await WineryBookingType.findByPk(bookingTypeId);
        expect(storedType).toBeTruthy();
        expect(storedType.wineryId).toBe(1);

        await request(app)
            .delete(`/api/winery/bookings/types/${bookingTypeId}`)
            .set('Authorization', authToken)
            .expect(200);

        const deletedType = await WineryBookingType.findByPk(bookingTypeId);
        expect(deletedType).toBeNull();
    });
});
