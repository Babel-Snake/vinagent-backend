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
  WineryIntegrationConfig
} = require('../../models');

describe('Generic Integration Webhook Routes', () => {
  const authToken = 'Bearer mock-token';
  const webhookSecret = 'generic-webhook-secret-123';

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
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await IntegrationEvent.destroy({ where: {} });
    await WineryIntegrationConfig.destroy({ where: {} });
  });

  function signBody(secret, body) {
    return crypto
      .createHmac('sha256', secret)
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

    const res = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
      .set('x-vinagent-webhook-signature', 'sha256=bad')
      .send(body)
      .expect(403);

    expect(res.body.error).toBe('Invalid signature');
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
    const signature = signBody(webhookSecret, body);

    const createRes = await request(app)
      .post('/api/webhooks/integration/1/crm')
      .set('content-type', 'application/json')
      .set('x-vinagent-webhook-secret', webhookSecret)
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
      .set('x-vinagent-webhook-signature', `sha256=${signature}`)
      .send(body)
      .expect(200);

    expect(duplicateRes.body.duplicate).toBe(true);
    expect(await IntegrationEvent.count()).toBe(1);
  });
});
