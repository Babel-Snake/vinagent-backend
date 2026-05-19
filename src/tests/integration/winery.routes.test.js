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
    WineryBookingType,
    WinerySettings
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
                crmProvider: 'commerce7',
                bookingProvider: 'nowbookit',
                providerConnections: {
                    crm: {
                        authMethod: 'api_key',
                        externalAccountId: 'c7-account-1',
                        externalLocationId: 'cellar-door',
                        capabilities: ['read_customers', 'record_order_event']
                    },
                    booking: {
                        authMethod: 'api_key',
                        externalAccountId: 'nbi-venue-1',
                        capabilities: ['check_availability', 'create_reservation']
                    }
                }
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
        expect(integrationConfig.crmProvider).toBe('commerce7');
        expect(integrationConfig.bookingProvider).toBe('nowbookit');
        expect(integrationConfig.providerConnections.crm.externalAccountId).toBe('c7-account-1');
        expect(integrationConfig.providerConnections.booking.executionProvider).toBe('mock');

        const settings = await WinerySettings.findOne({ where: { wineryId: 1 } });
        expect(settings.crmProvider).toBe('commerce7');
        expect(settings.crmConfig.selectedProvider).toBe('commerce7');
        expect(settings.bookingProvider).toBe('mock');
        expect(settings.bookingConfig.selectedProvider).toBe('nowbookit');
    });

    it('should test and persist integration connection status', async () => {
        await request(app)
            .put('/api/winery/integration-config')
            .set('Authorization', authToken)
            .send({
                smsProvider: 'twilio',
                emailProvider: 'sendgrid',
                crmProvider: 'commerce7',
                bookingProvider: 'other'
            })
            .expect(200);

        const res = await request(app)
            .post('/api/winery/integration-config/test')
            .set('Authorization', authToken)
            .send({ domain: 'crm' })
            .expect(200);

        expect(res.body.data.status).toBe('error');
        expect(res.body.data.provider).toBe('commerce7');
        expect(res.body.data.lastError).toMatch(/not implemented/i);

        const integrationConfig = await WineryIntegrationConfig.findOne({ where: { wineryId: 1 } });
        expect(integrationConfig.providerConnections.crm.status).toBe('error');
        expect(integrationConfig.providerConnections.crm.lastTestedAt).toBeTruthy();
    });

    it('should reject inbox sync when the winery is not configured for Outlook', async () => {
        await request(app)
            .put('/api/winery/integration-config')
            .set('Authorization', authToken)
            .send({
                smsProvider: 'twilio',
                emailProvider: 'sendgrid',
                crmProvider: 'other',
                bookingProvider: 'other'
            })
            .expect(200);

        const res = await request(app)
            .post('/api/winery/integration-config/email/sync')
            .set('Authorization', authToken)
            .send({ limit: 10 })
            .expect(400);

        expect(res.body.error.code).toBe('EMAIL_PROVIDER_UNSUPPORTED');
        expect(res.body.error.message).toMatch(/Outlook\/Microsoft 365/i);
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

    it('should update winery identity matching settings', async () => {
        await request(app)
            .put('/api/winery/settings')
            .set('Authorization', authToken)
            .send({
                identityMatchingConfig: {
                    autoLinkThreshold: 210,
                    reviewThreshold: 95,
                    maxReviewCandidates: 4,
                    allowPhoneSuffixNameAutoLink: false,
                    allowNameOnlyReview: true
                }
            })
            .expect(200);

        const settings = await WinerySettings.findOne({ where: { wineryId: 1 } });
        expect(settings.identityMatchingConfig.autoLinkThreshold).toBe(210);
        expect(settings.identityMatchingConfig.allowPhoneSuffixNameAutoLink).toBe(false);
    });
});
