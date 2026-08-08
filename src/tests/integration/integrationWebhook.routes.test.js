process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  IntegrationEvent,
  User,
  Winery,
  WineryIntegrationConfig,
  OperationalArea,
  OperationalAreaIntegrationConfig
} = require('../../models');

describe('Generic Integration Webhook Routes', () => {
  const originalDeploymentWineryId = process.env.DEPLOYMENT_WINERY_ID;
  const authToken = 'Bearer mock-token';
  const webhookSecret = 'generic-webhook-secret-123';
  const areaWebhookSecret = 'area-webhook-secret-123';
  let area;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    await Winery.create({
      id: 1,
      name: 'Generic Webhook Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'generic-webhook@example.com'
    });

    await User.create({
      id: 7,
      firebaseUid: 'generic-webhook-manager-uid',
      email: 'stub@example.com',
      displayName: 'Generic Webhook Manager',
      role: 'manager',
      wineryId: 1
    });
    area = await OperationalArea.create({ wineryId: 1, name: 'Restaurant', sortOrder: 1 });
  });

  afterAll(async () => {
    if (originalDeploymentWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
    else process.env.DEPLOYMENT_WINERY_ID = originalDeploymentWineryId;
    await sequelize.close();
  });

  beforeEach(async () => {
    await IntegrationEvent.destroy({ where: {} });
    await OperationalAreaIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.destroy({ where: {} });
  });

  function currentTimestamp() {
    return String(Math.floor(Date.now() / 1000));
  }

  function signBody(secret, timestamp, body) {
    return crypto
      .createHmac('sha256', secret)
      .update(timestamp)
      .update('.')
      .update(body)
      .digest('hex');
  }

  async function configureWebhookSecret() {
    return request(app)
      .put('/api/winery/integration-config')
      .set('Authorization', authToken)
      .send({
        crmProvider: 'commerce7',
        bookingProvider: 'other',
        providerConnections: {
          crm: {
            authMethod: 'webhook',
            webhookSecret,
            capabilities: ['receive_webhook', 'record_order_event']
          }
        }
      })
      .expect(200);
  }

  async function configureAreaWebhookSecret() {
    return request(app)
      .put(`/api/winery/areas/${area.id}/integration-config`)
      .set('Authorization', authToken)
      .send({
        providerConnections: {
          booking: {
            provider: 'opentable',
            authMethod: 'webhook',
            webhookSecret: areaWebhookSecret,
            capabilities: ['receive_webhook']
          }
        }
      })
      .expect(200);
  }

  it('stores webhook secret hashes without returning secret material', async () => {
    const res = await configureWebhookSecret();

    expect(res.body.data.providerConnections.crm.webhookSigningConfigured).toBe(true);
    expect(res.body.data.providerConnections.crm.webhookSecretHash).toBeUndefined();
    expect(res.body.data.providerConnections.crm.webhookSecret).toBeUndefined();
    expect(res.body.data.providerConnections.crm.webhookSecretLastRotatedAt).toBeTruthy();

    const config = await WineryIntegrationConfig.findOne({ where: { wineryId: 1 } });
    expect(config.providerConnections.crm.webhookSecretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(config.providerConnections.crm.webhookSecret).toBeUndefined();

    const fullRes = await request(app)
      .get('/api/winery/full')
      .set('Authorization', authToken)
      .expect(200);

    expect(fullRes.body.data.integrationConfig.providerConnections.crm.webhookSecretHash).toBeUndefined();
  });

  it('rejects generic webhooks without the configured secret and signature', async () => {
    await configureWebhookSecret();

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .send({
        eventType: 'notice.imported',
        rawPayload: { title: 'Unsigned event', body: 'Should not be accepted.' }
      })
      .expect(403);

    expect(res.body.error).toBe('Missing webhook secret');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('rejects a webhook path outside the operator-configured deployment winery', async () => {
    process.env.DEPLOYMENT_WINERY_ID = '1';
    try {
      await request(app)
        .post('/api/webhooks/integration/2/crm')
        .send({ externalEventId: 'wrong-deployment-winery-1' })
        .expect(404);

      expect(await IntegrationEvent.count()).toBe(0);
    } finally {
      if (originalDeploymentWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
      else process.env.DEPLOYMENT_WINERY_ID = originalDeploymentWineryId;
    }
  });

  it('rejects generic webhooks with an invalid HMAC signature', async () => {
    await configureWebhookSecret();

    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'notice.imported',
      externalEventId: 'bad-signature-1',
      rawPayload: {
        title: 'Bad signature',
        body: 'This payload should not be stored.'
      }
    });
    const timestamp = currentTimestamp();

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', 'sha256=bad')
      .send(body)
      .expect(403);

    expect(res.body.error).toBe('Invalid signature');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('rejects the legacy body-only signature when the timestamp is missing', async () => {
    await configureWebhookSecret();
    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'notice.imported',
      externalEventId: 'missing-timestamp-1'
    });
    const legacySignature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-signature', `sha256=${legacySignature}`)
      .send(body)
      .expect(403);

    expect(res.body.error).toBe('Missing timestamp');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('rejects correctly signed webhooks outside the five-minute window', async () => {
    await configureWebhookSecret();
    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'notice.imported',
      externalEventId: 'expired-timestamp-1'
    });
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = signBody(webhookSecret, timestamp, body);

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(403);

    expect(res.body.error).toBe('Invalid or expired timestamp');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('requires a stable external event ID for durable replay deduplication', async () => {
    await configureWebhookSecret();
    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'notice.imported',
      rawPayload: { title: 'Missing durable ID' }
    });
    const timestamp = currentTimestamp();
    const signature = signBody(webhookSecret, timestamp, body);

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(400);

    expect(res.body.error.code).toBe('EXTERNAL_EVENT_ID_REQUIRED');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('creates and deduplicates reviewable events from signed generic webhooks', async () => {
    await configureWebhookSecret();

    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'notice.imported',
      externalEventId: 'zapier-notice-1',
      rawPayload: {
        id: 'zapier-notice-1',
        title: 'New distributor note',
        body: 'Distributor pickup has moved to Friday morning.',
        posted_by: 'Ops automation'
      }
    });
    const timestamp = currentTimestamp();
    const signature = signBody(webhookSecret, timestamp, body);

    const createRes = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    expect(createRes.body.duplicate).toBe(false);
    expect(createRes.body.event).toMatchObject({
      provider: 'zapier',
      eventType: 'notice.imported',
      externalEventId: 'zapier-notice-1',
      status: 'PENDING_REVIEW'
    });
    expect(createRes.body.event.metadata.webhook).toMatchObject({
      domain: 'crm',
      configuredProvider: 'commerce7'
    });

    const duplicateRes = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(200);

    expect(duplicateRes.body.duplicate).toBe(true);
    expect(await IntegrationEvent.count()).toBe(1);
  });

  it('authenticates an area webhook and routes its event directly to that area', async () => {
    await configureAreaWebhookSecret();
    const body = JSON.stringify({
      provider: 'opentable',
      eventType: 'task.suggested',
      externalEventId: 'restaurant-booking-change-1',
      rawPayload: { summary: 'Guest requested a booking time change.' }
    });
    const timestamp = currentTimestamp();
    const signature = signBody(areaWebhookSecret, timestamp, body);

    const response = await request(app)
      .post(`/api/webhooks/integration/1/booking/${area.id}`)
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', areaWebhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(201);

    expect(response.body.event).toMatchObject({
      suggestedAreaId: area.id,
      areaConfidence: 1,
      areaMappingSource: 'RULE'
    });
    expect(response.body.event.metadata.webhook).toMatchObject({
      domain: 'booking',
      areaId: area.id,
      configuredProvider: 'opentable'
    });
  });

  it('does not fall back to the winery connection for an invalid area webhook path', async () => {
    await configureWebhookSecret();
    const body = JSON.stringify({
      provider: 'zapier',
      eventType: 'task.suggested',
      externalEventId: 'invalid-area-path-1'
    });
    const timestamp = currentTimestamp();
    const signature = signBody(webhookSecret, timestamp, body);

    await request(app)
      .post('/api/webhooks/integration/1/crm/0')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-timestamp', timestamp)
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(404);

    expect(await IntegrationEvent.count()).toBe(0);
  });
});
