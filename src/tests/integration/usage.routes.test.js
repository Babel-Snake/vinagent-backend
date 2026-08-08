process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.DEPLOYMENT_WINERY_ID = '1';

const request = require('supertest');
const app = require('../../app');
const {
  Attachment,
  Message,
  Task,
  UsageCounterBucket,
  UsageEvent,
  UsageGaugeSnapshot,
  User,
  UserActivityDaily,
  Winery,
  WineryBillingProfile,
  sequelize
} = require('../../models');
const {
  incrementUsageCounter,
  recordUsageEvent
} = require('../../services/usageTracking.service');
const { METRICS } = require('../../services/usageMetricCatalog');

describe('usage tracking routes', () => {
  const authorization = 'Bearer mock-token';

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.bulkCreate([
      { id: 1, name: 'Metered Winery', timeZone: 'Australia/Adelaide' },
      { id: 2, name: 'Other Winery', timeZone: 'Australia/Perth' }
    ]);
    await User.bulkCreate([
      {
        id: 1,
        firebaseUid: 'usage-manager',
        email: 'stub@example.com',
        displayName: 'Usage Manager',
        role: 'manager',
        isActive: true,
        wineryId: 1
      },
      {
        id: 2,
        firebaseUid: 'other-admin',
        email: 'other@example.com',
        displayName: 'Other Admin',
        role: 'admin',
        isActive: true,
        wineryId: 2
      }
    ]);
    const meteringStartedAt = new Date(Date.now() - 60_000);
    await WineryBillingProfile.bulkCreate([
      { wineryId: 1, lifecycleStatus: 'PILOT', planCode: 'pilot', billingProvider: 'none', meteringStartedAt },
      { wineryId: 2, lifecycleStatus: 'PILOT', planCode: 'pilot', billingProvider: 'none', meteringStartedAt }
    ]);
  });

  afterAll(async () => {
    delete process.env.DEPLOYMENT_WINERY_ID;
    await sequelize.close();
  });

  it('records engaged time once for each session sequence without accepting arbitrary dimensions', async () => {
    const body = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      sequence: 0,
      engagedSeconds: 60,
      routeGroup: 'tasks',
      customerEmail: 'must-not-be-stored@example.com'
    };

    await request(app)
      .post('/api/usage/activity')
      .set('Authorization', authorization)
      .send(body)
      .expect(202);

    const duplicate = await request(app)
      .post('/api/usage/activity')
      .set('Authorization', authorization)
      .send(body)
      .expect(200);

    expect(duplicate.body).toEqual({ duplicate: true, acceptedSeconds: 0 });
    const events = await UsageEvent.findAll({ where: { wineryId: 1, metricKey: METRICS.USER_ENGAGED_SECONDS } });
    expect(events).toHaveLength(1);
    expect(events[0].dimensions).toEqual({ authMode: 'firebase', routeGroup: 'tasks' });
    expect(JSON.stringify(events[0].toJSON())).not.toContain('must-not-be-stored');

    const activity = await UserActivityDaily.findOne({ where: { wineryId: 1, userId: 1 } });
    expect(activity.engagedSeconds).toBe(60);
    expect(activity.sessionCount).toBe(1);
  });

  it('clamps activity intervals and rejects invalid session identifiers', async () => {
    await request(app)
      .post('/api/usage/activity')
      .set('Authorization', authorization)
      .send({
        sessionId: '22222222-2222-4222-8222-222222222222',
        sequence: 0,
        engagedSeconds: 900,
        routeGroup: 'unknown-customer-record'
      })
      .expect(202);

    const event = await UsageEvent.findOne({
      where: { wineryId: 1, idempotencyKey: 'activity:1:22222222-2222-4222-8222-222222222222:0' }
    });
    expect(Number(event.quantity)).toBe(60);
    expect(event.dimensions.routeGroup).toBe('other');

    const invalid = await request(app)
      .post('/api/usage/activity')
      .set('Authorization', authorization)
      .send({ sessionId: 'not-a-session', sequence: 0, engagedSeconds: 10 })
      .expect(400);
    expect(invalid.body.error.code).toBe('USAGE_ACTIVITY_INVALID');
  });

  it('keeps idempotency tenant scoped and aggregates API counters atomically', async () => {
    const common = {
      metricKey: METRICS.AI_REQUEST,
      quantity: 1,
      sourceType: 'test',
      sourceId: 'completion-1',
      idempotencyKey: 'shared-completion',
      dimensions: { provider: 'openai', model: 'test-model', operation: 'test', result: 'success' }
    };
    await recordUsageEvent({ wineryId: 1, ...common });
    await recordUsageEvent({ wineryId: 2, ...common });
    expect(await UsageEvent.count({ where: { idempotencyKey: 'shared-completion' } })).toBe(2);
    await expect(recordUsageEvent({
      wineryId: 1,
      ...common,
      idempotencyKey: 'pii-dimension',
      dimensions: { ...common.dimensions, provider: 'customer@example.com' }
    })).rejects.toMatchObject({ code: 'USAGE_DIMENSION_INVALID' });

    const counterInput = {
      wineryId: 1,
      metricKey: METRICS.API_REQUESTS,
      occurredAt: new Date('2026-08-08T04:30:00.000Z'),
      dimensions: { routeGroup: 'tasks', method: 'GET', statusClass: '2xx', role: 'manager', authMode: 'firebase' },
      durationMs: 25,
      responseBytes: 100
    };
    await incrementUsageCounter(counterInput);
    await incrementUsageCounter(counterInput);
    const bucket = await UsageCounterBucket.findOne({ where: { wineryId: 1, metricKey: METRICS.API_REQUESTS } });
    expect(Number(bucket.eventCount)).toBe(2);
    expect(Number(bucket.durationMs)).toBe(50);
    expect(Number(bucket.responseBytes)).toBe(200);
  });

  it('returns only winery-scoped aggregate usage to managers', async () => {
    await Attachment.create({
      entityType: 'TASK',
      entityId: 999,
      wineryId: 1,
      filename: 'metered.pdf',
      originalFilename: 'metered.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      storageKey: '1/metered.pdf',
      uploadedBy: 1
    });

    const response = await request(app)
      .get('/api/usage/summary?start=2026-08-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z')
      .set('Authorization', authorization)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.usage.current).toMatchObject({ activeSeats: 1, storageBytes: 2048, members: 0 });
    expect(response.body.usage.activity.activeUsers).toBe(1);
    expect(response.body.usage.commercial).toMatchObject({ lifecycleStatus: 'PILOT', planCode: 'pilot', billingProvider: 'none' });
    expect(response.body.usage.commercial).not.toHaveProperty('providerCustomerId');
  });

  it('allows managers to capture gauges but limits reconciliation to administrators', async () => {
    await request(app)
      .post('/api/usage/snapshot')
      .set('Authorization', authorization)
      .send({})
      .expect(201);
    expect(await UsageGaugeSnapshot.count({ where: { wineryId: 1 } })).toBe(3);

    await request(app)
      .post('/api/usage/reconcile')
      .set('Authorization', authorization)
      .send({})
      .expect(403);
  });

  it('reconciles durable source rows against their immutable usage events', async () => {
    const user = await User.findByPk(1);
    user.role = 'admin';
    await user.save();

    const task = await Task.create({
      wineryId: 1,
      category: 'GENERAL',
      subType: 'USAGE_TEST',
      type: 'USAGE_TEST',
      customerType: 'UNKNOWN',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      areaScope: 'ORGANISATION'
    });
    const inbound = await Message.create({
      wineryId: 1,
      source: 'email',
      direction: 'inbound',
      body: 'redacted source fixture',
      externalId: 'usage-inbound-1'
    });
    const outbound = await Message.create({
      wineryId: 1,
      source: 'sms',
      direction: 'outbound',
      body: 'redacted source fixture',
      externalId: 'usage-outbound-1'
    });

    await recordUsageEvent({
      wineryId: 1,
      actorUserId: 1,
      metricKey: METRICS.TASK_CREATED,
      sourceType: 'task',
      sourceId: task.id,
      idempotencyKey: `task:${task.id}:created`,
      dimensions: { source: 'test', category: 'GENERAL', automation: 'false' }
    });
    await recordUsageEvent({
      wineryId: 1,
      metricKey: METRICS.MESSAGE_RECEIVED,
      sourceType: 'message',
      sourceId: inbound.id,
      idempotencyKey: `message:${inbound.id}:received`,
      dimensions: { channel: 'email', provider: 'test' }
    });
    await recordUsageEvent({
      wineryId: 1,
      metricKey: METRICS.MESSAGE_SENT,
      sourceType: 'message',
      sourceId: outbound.id,
      idempotencyKey: `message:${outbound.id}:sent`,
      dimensions: { channel: 'sms', provider: 'test', result: 'success' }
    });

    const response = await request(app)
      .post('/api/usage/reconcile')
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    expect(response.body.reconciliation.status).toBe('ok');
    expect(response.body.reconciliation.comparisons.every(item => item.matches)).toBe(true);
  });
});
