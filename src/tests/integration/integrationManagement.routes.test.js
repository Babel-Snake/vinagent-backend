process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const integrationJobService = require('../../services/integrationJob.service');
const canonicalEventOutboxService = require('../../services/canonicalEventOutbox.service');

describe('integration management routes', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let otherWinery;
  let manager;
  let localArea;
  let foreignArea;

  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Management Winery', timeZone: 'Australia/Adelaide' });
    otherWinery = await db.Winery.create({ name: 'Foreign Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'integration-management-manager',
      email: 'stub@example.com',
      displayName: 'Integration Manager',
      role: 'manager',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  beforeEach(async () => {
    await db.DataAuthorityPolicySet.update({ activePolicyId: null }, { where: {} });
    await db.IntegrationOperationAuditEvent.destroy({ where: {} });
    await db.DataAuthorityPolicySource.destroy({ where: {} });
    await db.DataAuthorityPolicy.destroy({ where: {} });
    await db.DataAuthorityPolicySet.destroy({ where: {} });
    await db.CanonicalEventOutbox.destroy({ where: {} });
    await db.IntegrationJob.destroy({ where: {} });
    await db.IntegrationEvent.destroy({ where: {} });
    await db.IntegrationSyncRun.destroy({ where: {} });
    await db.IntegrationSyncState.destroy({ where: {} });
    await db.IntegrationConnectionCapability.destroy({ where: {} });
    await db.IntegrationConnectionScope.destroy({ where: {} });
    await db.IntegrationCredential.destroy({ where: {} });
    await db.IntegrationConnection.destroy({ where: {} });
    await db.LocationAreaLink.destroy({ where: {} });
    await db.WineryLocation.destroy({ where: {} });
    await db.OperationalArea.destroy({ where: {} });
    await db.User.update({ role: 'manager' }, { where: { id: manager.id } });
    localArea = await db.OperationalArea.create({ wineryId: winery.id, name: 'Cellar Door' });
    foreignArea = await db.OperationalArea.create({ wineryId: otherWinery.id, name: 'Private Foreign Area' });
  });

  async function createManagedLocation() {
    return request(app)
      .post('/api/integration-management/locations')
      .set('Authorization', authToken)
      .send({ code: 'cellar-door', name: 'Cellar Door Venue', locationType: 'VENUE' })
      .expect(201);
  }

  async function createManagedConnection(locationId) {
    return request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: 'bookings-primary',
        providerKey: 'example-bookings',
        displayName: 'Primary bookings',
        configuration: { pollingMinutes: 10 },
        scopes: [{ domain: 'BOOKING', locationId, priority: 10, isDefault: true }]
      })
      .expect(201);
  }

  test('manages locations, scoped connection lifecycle, and versioned authority policies', async () => {
    const locationResponse = await createManagedLocation();
    const location = locationResponse.body.location;
    const link = await request(app)
      .post(`/api/integration-management/locations/${location.id}/areas`)
      .set('Authorization', authToken)
      .send({ areaId: localArea.id, relationshipType: 'PRIMARY_OPERATOR' })
      .expect(201);
    expect(link.body.link).toMatchObject({ wineryId: winery.id, locationId: location.id, areaId: localArea.id });

    const connectionResponse = await createManagedConnection(location.id);
    const connection = connectionResponse.body.connection;
    expect(connection).toMatchObject({
      wineryId: winery.id,
      connectionKey: 'bookings-primary',
      providerKey: 'example-bookings',
      status: 'PENDING',
      credentialConfigured: false,
      configuration: { pollingMinutes: 10 }
    });
    expect(connection.authReference).toBeUndefined();
    expect(connection.Scopes[0]).toMatchObject({ domain: 'BOOKING', locationId: location.id });

    const listed = await request(app)
      .get('/api/integration-management/connections?domain=BOOKING')
      .set('Authorization', authToken)
      .expect(200);
    expect(listed.body.connections).toHaveLength(1);

    const disabled = await request(app)
      .patch(`/api/integration-management/connections/${connection.id}`)
      .set('Authorization', authToken)
      .send({ lifecycleAction: 'DISABLE' })
      .expect(200);
    expect(disabled.body.connection.status).toBe('DISABLED');
    const reenabled = await request(app)
      .patch(`/api/integration-management/connections/${connection.id}`)
      .set('Authorization', authToken)
      .send({ lifecycleAction: 'ENABLE_PENDING' })
      .expect(200);
    expect(reenabled.body.connection.status).toBe('PENDING');

    const draft = await request(app)
      .post('/api/integration-management/authority-policies')
      .set('Authorization', authToken)
      .send({
        locationId: location.id,
        domain: 'BOOKING',
        fieldGroup: 'STATUS',
        resolutionStrategy: 'SOURCE_PRIORITY',
        sources: [{ connectionId: connection.id, sourceRole: 'PRIMARY', sourceOrder: 0 }]
      })
      .expect(201);
    expect(draft.body.policy).toMatchObject({ wineryId: winery.id, status: 'DRAFT', version: 1 });

    const active = await request(app)
      .post(`/api/integration-management/authority-policies/${draft.body.policy.id}/activate`)
      .set('Authorization', authToken)
      .send({})
      .expect(200);
    expect(active.body.policy.status).toBe('ACTIVE');

    const policies = await request(app)
      .get('/api/integration-management/authority-policies?domain=BOOKING')
      .set('Authorization', authToken)
      .expect(200);
    expect(policies.body.policySets).toHaveLength(1);
    expect(policies.body.policySets[0].ActivePolicy.Sources[0].Connection).toMatchObject({
      id: connection.id,
      providerKey: 'example-bookings'
    });
  });

  test('blocks secret persistence, provider-status escalation, invalid IDs, and foreign scopes', async () => {
    const location = (await createManagedLocation()).body.location;
    await request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: 'unsafe-connection',
        providerKey: 'unsafe-provider',
        displayName: 'Unsafe connection',
        configuration: { nested: { apiToken: 'must-not-persist' } },
        scopes: [{ domain: 'BOOKING', locationId: location.id }]
      })
      .expect(400);
    expect(await db.IntegrationConnection.count({ where: { wineryId: winery.id } })).toBe(0);

    const connection = (await createManagedConnection(location.id)).body.connection;
    await request(app)
      .delete(`/api/integration-management/connections/${connection.id}/scopes/${connection.Scopes[0].id}`)
      .set('Authorization', authToken)
      .expect(400);
    await request(app)
      .patch(`/api/integration-management/connections/${connection.id}`)
      .set('Authorization', authToken)
      .send({ status: 'CONNECTED' })
      .expect(400);
    await request(app)
      .get('/api/integration-management/connections/not-an-id')
      .set('Authorization', authToken)
      .expect(400);

    const foreignLocation = await db.WineryLocation.create({
      wineryId: otherWinery.id,
      code: 'foreign-private',
      name: 'Foreign Private Location',
      locationType: 'VENUE'
    });
    await request(app)
      .post(`/api/integration-management/connections/${connection.id}/scopes`)
      .set('Authorization', authToken)
      .send({ domain: 'INVENTORY', locationId: foreignLocation.id })
      .expect(400);

    const child = await request(app)
      .post('/api/integration-management/locations')
      .set('Authorization', authToken)
      .send({
        code: 'cellar-door-room',
        name: 'Cellar Door Room',
        locationType: 'ROOM',
        parentLocationId: location.id
      })
      .expect(201);
    await request(app)
      .patch(`/api/integration-management/locations/${location.id}`)
      .set('Authorization', authToken)
      .send({ parentLocationId: child.body.location.id })
      .expect(400);
    await request(app)
      .post(`/api/integration-management/locations/${location.id}/areas`)
      .set('Authorization', authToken)
      .send({ areaId: foreignArea.id, relationshipType: 'SUPPORTS' })
      .expect(400);
  });

  test('shows only tenant-scoped queue metadata and redacts sensitive job fields', async () => {
    const location = (await createManagedLocation()).body.location;
    const localConnection = (await createManagedConnection(location.id)).body.connection;
    const foreignConnection = await db.IntegrationConnection.create({
      wineryId: otherWinery.id,
      connectionKey: 'foreign-private',
      providerKey: 'private-provider',
      displayName: 'Foreign Private Connection',
      status: 'CONNECTED'
    });
    await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: localConnection.id,
      jobKind: 'SYNC_BOOKINGS',
      resourceType: 'BOOKING',
      payload: { cursor: 'next', accessToken: 'local-secret-token' },
      idempotencyKey: 'local-job'
    });
    await integrationJobService.enqueueIntegrationJob({
      wineryId: otherWinery.id,
      connectionId: foreignConnection.id,
      jobKind: 'SYNC_BOOKINGS',
      resourceType: 'BOOKING',
      payload: { privateMarker: 'foreign-private-job' },
      idempotencyKey: 'foreign-job'
    });
    await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: localConnection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-local',
      revision: '1',
      normalizedPayload: { privateDetails: 'local-event-payload' }
    });
    await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: otherWinery.id,
      connectionId: foreignConnection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-foreign',
      revision: '1',
      normalizedPayload: { privateMarker: 'foreign-private-event' }
    });

    const jobs = await request(app)
      .get('/api/integration-management/jobs')
      .set('Authorization', authToken)
      .expect(200);
    expect(jobs.body.jobs).toHaveLength(1);
    expect(jobs.body.jobs[0].payload.accessToken).toBe('[REDACTED]');
    expect(JSON.stringify(jobs.body)).not.toContain('foreign-private-job');

    const outbox = await request(app)
      .get('/api/integration-management/outbox')
      .set('Authorization', authToken)
      .expect(200);
    expect(outbox.body.outbox).toHaveLength(1);
    expect(outbox.body.outbox[0].Event.eventType).toBe('booking.changed');
    expect(JSON.stringify(outbox.body)).not.toContain('local-event-payload');
    expect(JSON.stringify(outbox.body)).not.toContain('foreign-private-event');

    const runtime = await request(app)
      .get('/api/integration-management/runtime')
      .set('Authorization', authToken)
      .expect(200);
    expect(runtime.body.workerConfigured).toBe(false);
    expect(runtime.body.bookingScheduler).toMatchObject({
      domain: 'BOOKING',
      schedulerStatus: 'AVAILABLE',
      enabled: false,
      policyVersion: '1',
      eligibleStreams: 0,
      dueStreams: 0,
      degradedStreams: 0,
      outstandingJobs: 0
    });
    expect(runtime.body.schedulers).toMatchObject({
      registeredDomains: 1,
      enabledDomains: 0,
      unavailableDomains: 0,
      domains: [expect.objectContaining({ domain: 'BOOKING', schedulerStatus: 'AVAILABLE' })]
    });
    expect(runtime.body.registeredJobKinds).toEqual([
      'BOOKING_HYDRATE',
      'BOOKING_INCREMENTAL',
      'BOOKING_RECONCILE',
      'BOOKING_VERIFY_CONNECTION',
      'PROVIDER_WEBHOOK_DISPATCH'
    ]);
    expect(runtime.body.providerWebhooks).toMatchObject({
      recoveryDomains: ['BOOKING'],
      adapters: [expect.objectContaining({ adapterKey: 'vinagent.hmac-change-hint' })],
      endpoints: [
        { status: 'ACTIVE', count: 0 },
        { status: 'DISABLED', count: 0 },
        { status: 'REVOKED', count: 0 }
      ]
    });
    expect(runtime.body.jobs.find(item => item.status === 'PENDING').count).toBe(1);
    expect(runtime.body.outbox.find(item => item.status === 'PENDING').count).toBe(1);
  });

  test('pauses streams and safely cancels, replays, and audits dead-letter work', async () => {
    const location = (await createManagedLocation()).body.location;
    const connection = (await createManagedConnection(location.id)).body.connection;
    const stream = await db.IntegrationSyncState.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'BOOKING',
      streamKey: 'booking:primary',
      cursor: 'private-provider-cursor',
      watermarkAt: new Date('2026-08-19T00:00:00.000Z'),
      initialBackfillStatus: 'COMPLETE',
      nextScheduledAt: new Date('2026-08-19T01:00:00.000Z')
    });
    const queued = (await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'BOOKING_INCREMENTAL',
      resourceType: 'BOOKING',
      streamKey: stream.streamKey,
      payload: { from: '2026-08-19T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z' },
      idempotencyKey: 'operator-controls-queued'
    })).job;

    const listed = await request(app)
      .get('/api/integration-management/sync-streams?operationalStatus=ACTIVE')
      .set('Authorization', authToken)
      .expect(200);
    expect(listed.body.syncStreams).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain('private-provider-cursor');

    const pauseRequest = {
      requestId: '11111111-1111-4111-8111-111111111111',
      reason: 'Provider maintenance requires a controlled temporary pause.'
    };
    const paused = await request(app)
      .post(`/api/integration-management/sync-streams/${stream.id}/pause`)
      .set('Authorization', authToken)
      .send(pauseRequest)
      .expect(201);
    expect(paused.body).toMatchObject({
      duplicate: false,
      cancelledJobIds: [queued.id],
      syncStream: { id: stream.id, operationalStatus: 'PAUSED' }
    });
    await expect(integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'BOOKING_INCREMENTAL',
      resourceType: 'BOOKING',
      streamKey: stream.streamKey,
      payload: {},
      idempotencyKey: 'must-not-enqueue-while-paused'
    })).rejects.toMatchObject({ code: 'SYNC_STREAM_PAUSED', statusCode: 409 });
    const duplicatePause = await request(app)
      .post(`/api/integration-management/sync-streams/${stream.id}/pause`)
      .set('Authorization', authToken)
      .send(pauseRequest)
      .expect(200);
    expect(duplicatePause.body).toMatchObject({ duplicate: true, cancelledJobIds: [queued.id] });

    await request(app)
      .post(`/api/integration-management/sync-streams/${stream.id}/resume`)
      .set('Authorization', authToken)
      .send({
        requestId: '22222222-2222-4222-8222-222222222222',
        reason: 'Provider maintenance is complete and scheduled sync may resume.'
      })
      .expect(201)
      .expect(response => {
        expect(response.body.syncStream.operationalStatus).toBe('ACTIVE');
        expect(response.body.syncStream.nextScheduledAt).toBeTruthy();
      });

    const deadLetter = (await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'BOOKING_INCREMENTAL',
      resourceType: 'BOOKING',
      streamKey: stream.streamKey,
      payload: { privateToken: 'must-not-return' },
      idempotencyKey: 'operator-controls-dead-letter'
    })).job;
    await deadLetter.update({
      status: 'FAILED',
      attemptCount: deadLetter.maxAttempts,
      completedAt: new Date(),
      deadLetteredAt: new Date(),
      lastErrorCode: 'PROVIDER_TEMPORARY_FAILURE',
      lastErrorSummary: 'Provider was unavailable.'
    });
    const replayRequest = {
      requestId: '33333333-3333-4333-8333-333333333333',
      reason: 'The provider incident is resolved and this failed sync should be retried.'
    };
    const replayed = await request(app)
      .post(`/api/integration-management/jobs/${deadLetter.id}/replay`)
      .set('Authorization', authToken)
      .send(replayRequest)
      .expect(202);
    expect(replayed.body).toMatchObject({
      sourceJobId: deadLetter.id,
      duplicate: false,
      job: { status: 'PENDING', replayedFromJobId: deadLetter.id }
    });
    expect(JSON.stringify(replayed.body)).not.toContain('must-not-return');
    const replayedAgain = await request(app)
      .post(`/api/integration-management/jobs/${deadLetter.id}/replay`)
      .set('Authorization', authToken)
      .send(replayRequest)
      .expect(200);
    expect(replayedAgain.body.job.id).toBe(replayed.body.job.id);

    await request(app)
      .post(`/api/integration-management/jobs/${replayed.body.job.id}/cancel`)
      .set('Authorization', authToken)
      .send({
        requestId: '44444444-4444-4444-8444-444444444444',
        reason: 'Operator is cancelling this queued replay before worker execution.'
      })
      .expect(201)
      .expect(response => expect(response.body.job.status).toBe('CANCELLED'));

    const eventResult = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-control-test',
      revision: '1',
      normalizedPayload: { privateDetails: 'not-returned-by-operations' }
    });
    await eventResult.outbox.update({
      status: 'FAILED',
      attemptCount: eventResult.outbox.maxAttempts,
      deadLetteredAt: new Date(),
      lastErrorCode: 'AUTOMATION_DELIVERY_FAILED',
      lastErrorSummary: 'Automation delivery failed.'
    });
    await request(app)
      .post(`/api/integration-management/outbox/${eventResult.outbox.id}/replay`)
      .set('Authorization', authToken)
      .send({
        requestId: '55555555-5555-4555-8555-555555555555',
        reason: 'The downstream automation issue is fixed and delivery can be replayed.'
      })
      .expect(202)
      .expect(response => {
        expect(response.body.outboxEntry).toMatchObject({ status: 'PENDING', attemptCount: 0, replayCount: 1 });
        expect(JSON.stringify(response.body)).not.toContain('not-returned-by-operations');
      });

    const operations = await request(app)
      .get('/api/integration-management/operations')
      .set('Authorization', authToken)
      .expect(200);
    expect(operations.body.operations.map(operation => operation.action)).toEqual(expect.arrayContaining([
      'SYNC_STREAM_PAUSED',
      'SYNC_STREAM_RESUMED',
      'JOB_REPLAYED',
      'JOB_CANCELLED',
      'OUTBOX_REPLAYED'
    ]));
    expect(operations.body.pagination.total).toBe(5);

    const runtime = await request(app)
      .get('/api/integration-management/runtime')
      .set('Authorization', authToken)
      .expect(200);
    expect(runtime.body.operationalControls).toEqual({
      pausedSyncStreams: 0,
      deadLetteredJobs: 1,
      deadLetteredOutboxEntries: 0
    });
  });

  test('requires winery-wide manager or admin authority', async () => {
    await db.User.update({ role: 'staff' }, { where: { id: manager.id } });
    await request(app)
      .get('/api/integration-management/runtime')
      .set('Authorization', authToken)
      .expect(403);
  });
});
