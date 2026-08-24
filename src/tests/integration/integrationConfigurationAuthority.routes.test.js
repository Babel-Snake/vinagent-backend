process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const integrationConnectionService = require('../../services/integrationConnection.service');

describe('integration configuration authority routes', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let connection;

  beforeEach(async () => {
    process.env.INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED = 'true';
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Cutover Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: `cutover-manager-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Cutover Manager',
      role: 'manager',
      wineryId: winery.id
    });
    await db.WineryIntegrationConfig.create({
      wineryId: winery.id,
      bookingProvider: 'sevenrooms',
      providerConnections: {
        booking: {
          provider: 'sevenrooms',
          status: 'connected',
          externalAccountId: 'legacy-account',
          webhookSecretHash: 'must-not-enter-a-cutover-snapshot'
        }
      }
    });
    await db.WinerySettings.create({
      wineryId: winery.id,
      enableBookingModule: false,
      bookingProvider: 'sevenrooms',
      bookingConfig: { selectedProvider: 'sevenrooms', legacyMarker: true }
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'canonical-booking',
      providerKey: 'opentable-sync',
      displayName: 'Canonical OpenTable',
      status: 'CONNECTED',
      externalAccountId: 'canonical-account',
      externalLocationId: 'canonical-location',
      configuration: { baseUrl: 'https://example.invalid/canonical' },
      createdBy: manager.id,
      updatedBy: manager.id,
      connectedAt: new Date(),
      lastHealthyAt: new Date()
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      priority: 0,
      isDefault: true,
      isActive: true
    });
    await db.IntegrationConnectionCapability.create({
      wineryId: winery.id,
      connectionId: connection.id,
      capabilityKey: 'bookings.read',
      kind: 'READ',
      contractVersion: '1',
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      supportsPolling: true
    });
    const policySet = await db.DataAuthorityPolicySet.create({
      wineryId: winery.id,
      scopeKey: 'winery',
      domain: 'BOOKING',
      fieldGroup: 'CORE'
    });
    const policy = await db.DataAuthorityPolicy.create({
      policySetId: policySet.id,
      wineryId: winery.id,
      version: 1,
      status: 'ACTIVE',
      resolutionStrategy: 'SOURCE_PRIORITY',
      approvedBy: manager.id,
      approvedAt: new Date(),
      effectiveFrom: new Date()
    });
    await db.DataAuthorityPolicySource.create({
      policyId: policy.id,
      wineryId: winery.id,
      connectionId: connection.id,
      sourceRole: 'PRIMARY',
      sourceOrder: 0
    });
    await policySet.update({ activePolicyId: policy.id });
    await db.IntegrationDomainActivation.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      status: 'ACTIVE',
      sourceWatermarkAt: new Date('2026-08-20T00:00:00.000Z'),
      activatedAt: new Date(),
      activatedBy: manager.id,
      activationReason: 'Test canonical activation.',
      requestId: crypto.randomUUID(),
      previewHash: 'a'.repeat(64),
      previewSnapshot: {},
      authorityPolicyId: policy.id
    });
  });

  afterEach(() => {
    delete process.env.INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED;
  });

  afterAll(async () => db.sequelize.close());

  test('prepares, activates, projects sanitized compatibility, enforces one writer, and rolls back', async () => {
    const initialPreview = await request(app)
      .get('/api/integration-management/configuration-authorities/BOOKING/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(initialPreview.body).toEqual(expect.objectContaining({
      domain: 'BOOKING',
      authorityStatus: 'LEGACY_PRIMARY',
      ready: true,
      reasons: [],
      previewToken: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));

    const prepareRequestId = crypto.randomUUID();
    const prepared = await request(app)
      .post('/api/integration-management/configuration-authorities/BOOKING/prepare')
      .set('Authorization', auth)
      .send({
        requestId: prepareRequestId,
        previewToken: initialPreview.body.previewToken,
        reason: 'Capture the reviewed legacy baseline before switching writers.'
      })
      .expect(201);
    expect(prepared.body.authority.status).toBe('PREPARED');
    expect(JSON.stringify((await db.IntegrationConfigurationAuthority.findByPk(prepared.body.authority.id)).legacySnapshot))
      .not.toContain('must-not-enter-a-cutover-snapshot');

    const duplicatePrepare = await request(app)
      .post('/api/integration-management/configuration-authorities/BOOKING/prepare')
      .set('Authorization', auth)
      .send({
        requestId: prepareRequestId,
        previewToken: initialPreview.body.previewToken,
        reason: 'Capture the reviewed legacy baseline before switching writers.'
      })
      .expect(200);
    expect(duplicatePrepare.body.duplicate).toBe(true);

    await request(app)
      .post('/api/integration-management/configuration-authorities/BOOKING/activate')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: initialPreview.body.previewToken,
        reason: 'Attempt activation with an intentionally stale preview token.',
        acknowledgeOneWriter: true
      })
      .expect(400);

    const preparedPreview = await request(app)
      .get('/api/integration-management/configuration-authorities/BOOKING/preview')
      .set('Authorization', auth)
      .expect(200);
    const activated = await request(app)
      .post('/api/integration-management/configuration-authorities/BOOKING/activate')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: preparedPreview.body.previewToken,
        reason: 'Switch Booking configuration to the reviewed canonical writer.',
        acknowledgeOneWriter: true
      })
      .expect(201);
    expect(activated.body.authority.status).toBe('CANONICAL_PRIMARY');

    const legacyConfig = await db.WineryIntegrationConfig.findOne({ where: { wineryId: winery.id } });
    expect(legacyConfig.bookingProvider).toBe('opentable');
    expect(legacyConfig.providerConnections.booking).toEqual(expect.objectContaining({
      provider: 'opentable',
      authMethod: 'protected_reference',
      externalAccountId: 'canonical-account'
    }));
    expect(JSON.stringify(legacyConfig.providerConnections.booking)).not.toMatch(/secret|credentialId|authReference/i);
    await expect(integrationConnectionService.resolveExecutionConfig({
      wineryId: winery.id,
      domain: 'booking'
    })).resolves.toEqual(expect.objectContaining({
      provider: 'opentable',
      source: 'canonical-winery'
    }));

    await request(app)
      .put('/api/winery/integration-config')
      .set('Authorization', auth)
      .send({ bookingProvider: 'resy', providerConnections: { booking: { provider: 'resy' } } })
      .expect(409);
    await request(app)
      .patch(`/api/integration-management/connections/${connection.id}`)
      .set('Authorization', auth)
      .send({ externalLocationId: 'changed-location' })
      .expect(409);

    const rollbackRequestId = crypto.randomUUID();
    const rolledBack = await request(app)
      .post('/api/integration-management/configuration-authorities/BOOKING/rollback')
      .set('Authorization', auth)
      .send({
        requestId: rollbackRequestId,
        reason: 'Restore the captured legacy writer after an operator-approved rollback.',
        acknowledgeLegacyRestore: true
      })
      .expect(201);
    expect(rolledBack.body.authority.status).toBe('ROLLED_BACK');
    await legacyConfig.reload();
    expect(legacyConfig.bookingProvider).toBe('sevenrooms');
    expect(legacyConfig.providerConnections.booking).toEqual(expect.objectContaining({
      provider: 'sevenrooms',
      externalAccountId: 'legacy-account'
    }));
    const restoredSettings = await db.WinerySettings.findOne({ where: { wineryId: winery.id } });
    expect(restoredSettings.bookingConfig).toEqual({ selectedProvider: 'sevenrooms', legacyMarker: true });
    expect(await db.IntegrationOperationAuditEvent.count({
      where: { wineryId: winery.id, targetType: 'INTEGRATION_CONFIGURATION_AUTHORITY' }
    })).toBe(3);
  });

  test('fails closed for an unregistered domain and when the deployment gate is disabled', async () => {
    const unsupported = await request(app)
      .get('/api/integration-management/configuration-authorities/CUSTOMER/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(unsupported.body).toEqual(expect.objectContaining({
      supported: false,
      ready: false,
      reasons: ['DOMAIN_CUTOVER_HANDLER_NOT_REGISTERED']
    }));

    process.env.INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED = 'false';
    const booking = await request(app)
      .get('/api/integration-management/configuration-authorities/BOOKING/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(booking.body.ready).toBe(false);
    expect(booking.body.reasons).toContain('DEPLOYMENT_CUTOVER_GATE_DISABLED');
  });

  test('preserves every canonically owned legacy slot during an unrelated full config update', async () => {
    const config = await db.WineryIntegrationConfig.findOne({ where: { wineryId: winery.id } });
    await config.update({
      deliveryProvider: 'auspost',
      providerConnections: {
        ...config.providerConnections,
        delivery: {
          provider: 'auspost',
          status: 'connected',
          externalAccountId: 'canonical-delivery-account'
        }
      }
    });
    await db.IntegrationConfigurationAuthority.create({
      wineryId: winery.id,
      domain: 'FULFILMENT',
      status: 'CANONICAL_PRIMARY',
      activatedAt: new Date(),
      activatedBy: manager.id,
      lastTransitionReason: 'Fixture future-domain canonical authority.',
      canonicalSnapshot: {},
      lockVersion: 1
    });

    await request(app)
      .put('/api/winery/integration-config')
      .set('Authorization', auth)
      .send({
        smsProvider: 'messagemedia',
        smsFromNumber: '+61400000000',
        providerConnections: {
          sms: {
            provider: 'messagemedia',
            status: 'not_connected'
          }
        }
      })
      .expect(200);

    await config.reload();
    expect(config.deliveryProvider).toBe('auspost');
    expect(config.providerConnections.delivery).toEqual(expect.objectContaining({
      provider: 'auspost',
      externalAccountId: 'canonical-delivery-account'
    }));
    expect(config.smsProvider).toBe('messagemedia');
  });
});
