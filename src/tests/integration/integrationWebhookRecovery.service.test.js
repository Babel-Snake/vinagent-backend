process.env.NODE_ENV = 'test';
process.env.INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS = 'true';
process.env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS = 'booking-feed.test';

const db = require('../../models');
const { hydrationStreamKey } = require('../../services/bookingShadowSync.service');
const {
  dispatchBookingWebhookRecovery
} = require('../../services/integrationWebhookRecoveries.service');

describe('provider webhook Booking recovery', () => {
  let winery;
  let manager;
  let location;
  let connection;
  let stream;
  let event;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Recovery Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'webhook-recovery-manager',
      email: 'recovery@example.com',
      displayName: 'Recovery Manager',
      role: 'manager',
      wineryId: winery.id
    });
    location = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door',
      locationType: 'VENUE'
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'booking-recovery',
      providerKey: 'vinagent-booking-feed',
      displayName: 'Booking recovery feed',
      status: 'CONNECTED',
      externalLocationId: 'provider-location-1',
      configuration: {
        baseUrl: 'http://booking-feed.test',
        contractVersion: '1',
        shadowMode: true,
        guestDataMode: 'NONE',
        pageSize: 50
      }
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: `location:${location.id}`,
      locationId: location.id,
      isActive: true,
      isDefault: true
    });
    const policySet = await db.DataAuthorityPolicySet.create({
      wineryId: winery.id,
      scopeKey: `location:${location.id}`,
      locationId: location.id,
      domain: 'BOOKING',
      fieldGroup: 'STATUS'
    });
    const policy = await db.DataAuthorityPolicy.create({
      policySetId: policySet.id,
      wineryId: winery.id,
      version: 1,
      status: 'ACTIVE',
      resolutionStrategy: 'SOURCE_PRIORITY',
      effectiveFrom: new Date('2026-08-20T00:00:00.000Z'),
      createdBy: manager.id,
      approvedBy: manager.id,
      approvedAt: new Date('2026-08-20T00:00:00.000Z')
    });
    await policySet.update({ activePolicyId: policy.id });
    await db.IntegrationDomainActivation.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: `location:${location.id}`,
      locationId: location.id,
      status: 'ACTIVE',
      sourceWatermarkAt: new Date('2026-08-20T00:00:00.000Z'),
      activatedAt: new Date('2026-08-20T00:00:00.000Z'),
      activatedBy: manager.id,
      activationReason: 'Enable canonical Booking recovery for verified provider webhooks.',
      requestId: '11111111-1111-4111-8111-111111111111',
      previewHash: 'a'.repeat(64),
      previewSnapshot: {},
      authorityPolicyId: policy.id
    });
    stream = await db.IntegrationSyncState.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'BOOKING',
      streamKey: hydrationStreamKey({ connectionId: connection.id, externalLocationId: connection.externalLocationId }),
      watermarkAt: new Date('2026-08-20T04:00:00.000Z'),
      initialBackfillStatus: 'COMPLETE',
      operationalStatus: 'ACTIVE'
    });
    event = await db.IntegrationEvent.create({
      wineryId: winery.id,
      connectionId: connection.id,
      provider: connection.providerKey,
      intakeMethod: 'provider_webhook',
      eventType: 'booking.changed',
      externalEventId: 'provider-event-1',
      eventScopeKey: `connection:${connection.id}:source:provider-webhook`,
      idempotencyKey: 'provider-event-1',
      eventClass: 'INTAKE',
      normalizedPayload: { changes: [{ resourceType: 'BOOKING', externalId: 'booking-1', changeKind: 'UPSERT' }] },
      status: 'PROCESSED',
      receivedAt: new Date('2026-08-20T05:00:00.000Z'),
      metadata: { domain: 'BOOKING' },
      automationEligible: false
    });
  });

  afterAll(async () => db.sequelize.close());

  test('schedules a rate-governed incremental read and coalesces subsequent hints', async () => {
    const now = new Date('2026-08-20T05:00:00.000Z');
    const first = await dispatchBookingWebhookRecovery({ event, connection, workerId: 'worker-webhook', now });
    expect(first).toMatchObject({ domain: 'BOOKING', status: 'SCHEDULED' });
    const job = await db.IntegrationJob.findByPk(first.jobId);
    expect(job).toMatchObject({
      jobKind: 'BOOKING_INCREMENTAL',
      resourceType: 'BOOKING',
      streamKey: stream.streamKey,
      sourceEventId: event.id,
      priority: 50
    });
    expect(job.payload).toMatchObject({
      mode: 'INCREMENTAL',
      checkpointWatermarkAt: '2026-08-20T04:00:00.000Z',
      webhookRecovery: { sourceEventId: event.id, externalEventId: 'provider-event-1' }
    });
    const permit = await db.IntegrationProviderScheduleState.findOne({
      where: { domain: 'BOOKING', providerKey: connection.providerKey }
    });
    expect(permit).toMatchObject({ scheduledCount: 1, lastJobKind: 'BOOKING_INCREMENTAL' });

    const secondEvent = await db.IntegrationEvent.create({
      ...event.toJSON(),
      id: undefined,
      externalEventId: 'provider-event-2',
      idempotencyKey: 'provider-event-2',
      receivedAt: new Date('2026-08-20T05:00:01.000Z'),
      createdAt: undefined,
      updatedAt: undefined
    });
    const second = await dispatchBookingWebhookRecovery({
      event: secondEvent,
      connection,
      workerId: 'worker-webhook',
      now: new Date('2026-08-20T05:00:01.000Z')
    });
    expect(second).toEqual({ domain: 'BOOKING', status: 'COALESCED', jobId: job.id });
    expect(await db.IntegrationJob.count({ where: { jobKind: 'BOOKING_INCREMENTAL' } })).toBe(1);
  });
});
