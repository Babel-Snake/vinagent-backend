process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.INTEGRATION_CREDENTIALS_ENABLED = 'true';
process.env.INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID = 'provider-webhook-test-key';
process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const { WEBHOOK_CHANGE_HINT_SCHEMA_VERSION } = require('../../services/integrationWebhookAdapter.contract');

describe('provider-neutral webhook routes', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let connection;

  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Webhook Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'provider-webhook-manager',
      email: 'stub@example.com',
      displayName: 'Webhook Manager',
      role: 'manager',
      wineryId: winery.id
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'provider-webhook-bookings',
      providerKey: 'example-bookings',
      displayName: 'Example bookings',
      status: 'PENDING',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      isActive: true,
      isDefault: true
    });
  });

  function changeHint(eventId) {
    return {
      schemaVersion: WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
      eventId,
      eventType: 'booking.changed',
      occurredAt: new Date().toISOString(),
      providerEventVersion: '1',
      correlationId: `correlation-${eventId}`,
      changes: [{ resourceType: 'BOOKING', externalId: `booking-${eventId}`, changeKind: 'UPSERT' }]
    };
  }

  function signedHeaders(secret, payload, timestamp = String(Math.floor(Date.now() / 1000))) {
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret)
      .update(timestamp)
      .update('.')
      .update(raw)
      .digest('hex');
    return {
      'x-vinagent-webhook-timestamp': timestamp,
      'x-vinagent-webhook-signature': `sha256=${signature}`
    };
  }

  async function createEndpoint() {
    return request(app)
      .post(`/api/integration-management/connections/${connection.id}/webhook-endpoints`)
      .set('Authorization', auth)
      .send({ domain: 'BOOKING', adapterKey: 'vinagent.hmac-change-hint' })
      .expect(201);
  }

  test('creates an encrypted endpoint without returning its secret in later reads', async () => {
    const created = await createEndpoint();
    expect(created.body.endpoint).toMatchObject({
      connectionId: connection.id,
      domain: 'BOOKING',
      adapterKey: 'vinagent.hmac-change-hint',
      status: 'ACTIVE'
    });
    expect(created.body.disclosure.secret).toEqual(expect.any(String));
    const stored = await db.IntegrationWebhookEndpoint.findByPk(created.body.endpoint.id);
    expect(stored.encryptedVerificationMaterial).not.toContain(created.body.disclosure.secret);

    const listed = await request(app)
      .get(`/api/integration-management/connections/${connection.id}/webhook-endpoints`)
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body.endpoints).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.disclosure.secret);
    expect(JSON.stringify(listed.body)).not.toContain('encryptedVerificationMaterial');

    await request(app)
      .get('/api/integration-management/webhook-adapters')
      .set('Authorization', auth)
      .expect(200)
      .expect(response => expect(response.body.adapters[0]).toMatchObject({
        adapterKey: 'vinagent.hmac-change-hint',
        verificationScheme: 'HMAC_SHA256_TIMESTAMPED'
      }));
  });

  test('durably accepts, deduplicates, and queues verified change hints without storing raw payloads', async () => {
    const created = await createEndpoint();
    const payload = changeHint('event-accepted-once');
    const headers = signedHeaders(created.body.disclosure.secret, payload);
    const first = await request(app)
      .post(created.body.endpoint.path)
      .set(headers)
      .send(payload)
      .expect(202);
    expect(first.body).toMatchObject({
      accepted: true,
      duplicate: false,
      receipt: { domain: 'BOOKING' }
    });
    const event = await db.IntegrationEvent.findByPk(first.body.receipt.eventId);
    expect(event).toMatchObject({
      wineryId: winery.id,
      connectionId: connection.id,
      intakeMethod: 'provider_webhook',
      eventClass: 'INTAKE',
      automationEligible: false,
      rawPayload: null
    });
    expect(event.normalizedPayload).toEqual({
      schemaVersion: WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
      changes: payload.changes
    });
    const job = await db.IntegrationJob.findByPk(first.body.receipt.dispatchJobId);
    expect(job).toMatchObject({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'PROVIDER_WEBHOOK_DISPATCH',
      sourceEventId: event.id,
      status: 'PENDING'
    });

    const replay = await request(app)
      .post(created.body.endpoint.path)
      .set(headers)
      .send(payload)
      .expect(200);
    expect(replay.body).toMatchObject({
      duplicate: true,
      receipt: { eventId: event.id, dispatchJobId: job.id }
    });
    expect(await db.IntegrationEvent.count()).toBe(1);
    expect(await db.IntegrationJob.count()).toBe(1);
  });

  test('rejects invalid signatures and enforces rotation and lifecycle changes', async () => {
    const created = await createEndpoint();
    const firstSecret = created.body.disclosure.secret;
    const invalidPayload = changeHint('invalid-signature');
    await request(app)
      .post(created.body.endpoint.path)
      .set(signedHeaders('wrong-secret', invalidPayload))
      .send(invalidPayload)
      .expect(401);
    expect(await db.IntegrationEvent.count()).toBe(0);

    const rotated = await request(app)
      .post(`/api/integration-management/connections/${connection.id}/webhook-endpoints/${created.body.endpoint.id}/rotate`)
      .set('Authorization', auth)
      .send({})
      .expect(201);
    expect(rotated.body.disclosure.secret).not.toBe(firstSecret);
    const oldSecretPayload = changeHint('old-secret-rejected');
    await request(app)
      .post(created.body.endpoint.path)
      .set(signedHeaders(firstSecret, oldSecretPayload))
      .send(oldSecretPayload)
      .expect(401);

    const acceptedPayload = changeHint('new-secret-accepted');
    await request(app)
      .post(created.body.endpoint.path)
      .set(signedHeaders(rotated.body.disclosure.secret, acceptedPayload))
      .send(acceptedPayload)
      .expect(202);

    await request(app)
      .post(`/api/integration-management/connections/${connection.id}/webhook-endpoints/${created.body.endpoint.id}/lifecycle`)
      .set('Authorization', auth)
      .send({ action: 'DISABLE' })
      .expect(200);
    const disabledPayload = changeHint('disabled-endpoint');
    await request(app)
      .post(created.body.endpoint.path)
      .set(signedHeaders(rotated.body.disclosure.secret, disabledPayload))
      .send(disabledPayload)
      .expect(404);
  });
});
