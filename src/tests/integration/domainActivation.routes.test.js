process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.INTEGRATION_DOMAIN_ACTIVATION_ENABLED = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const dataAuthorityPolicy = require('../../services/dataAuthorityPolicy.service');
const domainActivation = require('../../services/domainActivation.service');

describe('common provider-neutral domain activation', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let connection;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Domain Activation Winery' });
    manager = await db.User.create({
      firebaseUid: 'domain-activation-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Activation Manager',
      role: 'manager',
      wineryId: winery.id
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'fulfilment-fixture',
      providerKey: 'fixture-fulfilment',
      displayName: 'Fulfilment fixture',
      status: 'CONNECTED',
      lastHealthCheckedAt: new Date(baseTime - 1000),
      lastHealthyAt: new Date(baseTime - 1000),
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'FULFILMENT',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    await db.IntegrationConnectionCapability.create({
      wineryId: winery.id,
      connectionId: connection.id,
      capabilityKey: 'fulfilment.read.shadow',
      kind: 'READ',
      contractVersion: '1',
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      supportsWebhook: true,
      supportsPolling: false,
      lastVerifiedAt: new Date(baseTime - 1000)
    });
    const policy = await dataAuthorityPolicy.createAuthorityPolicyVersion({
      wineryId: winery.id,
      domain: 'FULFILMENT',
      fieldGroup: 'CORE',
      resolutionStrategy: 'SOURCE_PRIORITY',
      sources: [{
        connectionId: connection.id,
        sourceRole: 'PRIMARY',
        sourceOrder: 0
      }],
      actorUserId: manager.id
    });
    await dataAuthorityPolicy.activateAuthorityPolicy({
      policyId: policy.id,
      wineryId: winery.id,
      actorUserId: manager.id,
      effectiveAt: new Date(baseTime - 500)
    });
  });

  afterAll(async () => db.sequelize.close());

  test('previews and activates an empty but verified webhook domain non-retroactively', async () => {
    const previewResponse = await request(app)
      .get('/api/integration-management/connections/' + connection.id
        + '/domain-activations/FULFILMENT/preview')
      .set('Authorization', auth);
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body).toEqual(expect.objectContaining({
      schemaVersion: 'domain.activation.v1',
      domain: 'FULFILMENT',
      ready: true,
      reasons: [],
      credentialReadiness: 'FIXTURE_EXEMPT',
      sourceReferenceCount: 0,
      projectedReferenceCount: 0,
      automationEligible: false
    }));

    const requestId = crypto.randomUUID();
    const activationResponse = await request(app)
      .post('/api/integration-management/connections/' + connection.id
        + '/domain-activations/FULFILMENT')
      .set('Authorization', auth)
      .send({
        scopeKey: 'winery',
        requestId,
        previewToken: previewResponse.body.previewToken,
        reason: 'Enable canonical fulfilment events after fixture verification.',
        acknowledgeNonRetroactive: true
      });
    expect(activationResponse.status).toBe(201);
    expect(activationResponse.body.activation).toEqual(expect.objectContaining({
      domain: 'FULFILMENT',
      scopeKey: 'winery',
      status: 'ACTIVE'
    }));
    const liveCapability = await db.IntegrationConnectionCapability.findOne({
      where: {
        connectionId: connection.id,
        capabilityKey: 'fulfilment.canonical.events.live'
      }
    });
    expect(liveCapability).toMatchObject({
      enabled: true,
      availabilityStatus: 'AVAILABLE'
    });
    expect(liveCapability.metadata).toEqual(expect.objectContaining({
      nonRetroactive: true,
      activationId: activationResponse.body.activation.id
    }));

    const duplicate = await request(app)
      .post('/api/integration-management/connections/' + connection.id
        + '/domain-activations/FULFILMENT')
      .set('Authorization', auth)
      .send({
        scopeKey: 'winery',
        requestId,
        previewToken: previewResponse.body.previewToken,
        reason: 'Enable canonical fulfilment events after fixture verification.',
        acknowledgeNonRetroactive: true
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);

    const disabled = await request(app)
      .post('/api/integration-management/connections/' + connection.id
        + '/domain-activations/FULFILMENT/disable')
      .set('Authorization', auth)
      .send({
        scopeKey: 'winery',
        reason: 'Pause live fulfilment events while reviewing the provider feed.'
      });
    expect(disabled.status).toBe(201);
    expect(disabled.body.activation.status).toBe('DISABLED');
    await liveCapability.reload();
    expect(liveCapability).toMatchObject({
      enabled: false,
      availabilityStatus: 'UNAVAILABLE',
      unavailableReason: 'DOMAIN_ACTIVATION_DISABLED'
    });
  });

  test('fails closed on deployment, capability, and lifecycle controls', async () => {
    const gated = await domainActivation.domainActivationPreview({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'FULFILMENT',
      env: {},
      now: new Date(baseTime)
    });
    expect(gated).toEqual(expect.objectContaining({
      ready: false,
      reasons: expect.arrayContaining(['DEPLOYMENT_ACTIVATION_GATE_DISABLED'])
    }));

    await db.IntegrationConnectionCapability.update({
      availabilityStatus: 'UNAVAILABLE'
    }, {
      where: {
        connectionId: connection.id,
        capabilityKey: 'fulfilment.read.shadow'
      }
    });
    const unavailable = await domainActivation.domainActivationPreview({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'FULFILMENT',
      env: { INTEGRATION_DOMAIN_ACTIVATION_ENABLED: 'true' }
    });
    expect(unavailable).toEqual(expect.objectContaining({
      ready: false,
      reasons: expect.arrayContaining(['READ_CAPABILITY_UNAVAILABLE'])
    }));

    await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'SHIPMENT',
      externalId: 'mismatched-shipment',
      canonicalType: 'BOOKING',
      canonicalId: 999,
      resolutionStatus: 'RESOLVED',
      observedAt: new Date(baseTime)
    });
    const mismatched = await domainActivation.domainActivationPreview({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'FULFILMENT',
      env: { INTEGRATION_DOMAIN_ACTIVATION_ENABLED: 'true' }
    });
    expect(mismatched.reasons).toEqual(expect.arrayContaining([
      'SHADOW_RESOURCES_NOT_FULLY_PROJECTED',
      'CANONICAL_RESOURCE_TYPE_MISMATCH'
    ]));

    await expect(domainActivation.domainActivationPreview({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      env: { INTEGRATION_DOMAIN_ACTIVATION_ENABLED: 'true' }
    })).rejects.toThrow('Use the Booking activation workflow');
  });
});
