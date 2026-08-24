process.env.NODE_ENV = 'test';
process.env.INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS = 'true';
process.env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS = 'scheduler.example.test:8443';

const crypto = require('crypto');
const db = require('../../models');
const {
  scheduleDueBookingSyncs,
  getBookingSyncSchedulerStatus
} = require('../../services/bookingSyncScheduler.service');
const { getBookingSyncSchedulerConfig } = require('../../services/bookingSyncSchedulerConfig.service');
const { hydrationStreamKey } = require('../../services/bookingShadowSync.service');

describe('durable booking sync scheduler', () => {
  let winery;
  let authorityPolicy;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Scheduler Winery', timeZone: 'Australia/Adelaide' });
    const policySet = await db.DataAuthorityPolicySet.create({
      wineryId: winery.id,
      scopeKey: 'winery',
      domain: 'BOOKING',
      fieldGroup: 'CORE'
    });
    authorityPolicy = await db.DataAuthorityPolicy.create({
      policySetId: policySet.id,
      wineryId: winery.id,
      version: 1,
      status: 'ACTIVE',
      resolutionStrategy: 'SOURCE_PRIORITY',
      effectiveFrom: new Date('2026-08-18T00:00:00.000Z')
    });
  });

  afterAll(async () => db.sequelize.close());

  function schedulerConfig(overrides = {}) {
    return getBookingSyncSchedulerConfig({
      INTEGRATION_BOOKING_SCHEDULER_ENABLED: 'true',
      INTEGRATION_BOOKING_INCREMENTAL_INTERVAL_SECONDS: '300',
      INTEGRATION_BOOKING_RECONCILIATION_INTERVAL_SECONDS: '3600',
      INTEGRATION_BOOKING_PROVIDER_MINIMUM_SPACING_SECONDS: '5',
      INTEGRATION_BOOKING_PROVIDER_RATE_WINDOW_SECONDS: '60',
      INTEGRATION_BOOKING_PROVIDER_MAX_JOBS_PER_RATE_WINDOW: '2',
      INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS: '24',
      INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS: '720',
      ...overrides
    });
  }

  async function createEligibleStream({ suffix, activatedAt, nextScheduledAt = null }) {
    const connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: `scheduler-feed-${suffix}`,
      providerKey: 'vinagent-booking-feed',
      displayName: `Scheduler feed ${suffix}`,
      status: 'CONNECTED',
      externalLocationId: `provider-location-${suffix}`,
      configuration: {
        baseUrl: 'http://scheduler.example.test:8443',
        contractVersion: '1',
        shadowMode: true,
        guestDataMode: 'NONE',
        pageSize: 100
      },
      connectedAt: new Date('2026-08-18T00:00:00.000Z')
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    for (const capabilityKey of ['bookings.read.shadow', 'bookings.canonical.events.live']) {
      await db.IntegrationConnectionCapability.create({
        wineryId: winery.id,
        connectionId: connection.id,
        capabilityKey,
        kind: 'READ',
        contractVersion: '1',
        enabled: true,
        availabilityStatus: 'AVAILABLE',
        supportsPolling: true
      });
    }
    const syncState = await db.IntegrationSyncState.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'BOOKING',
      streamKey: hydrationStreamKey({
        connectionId: connection.id,
        externalLocationId: connection.externalLocationId
      }),
      watermarkAt: new Date('2026-08-18T23:55:00.000Z'),
      initialBackfillStatus: 'COMPLETE',
      lastSuccessfulSyncAt: new Date('2026-08-18T23:55:00.000Z'),
      nextScheduledAt
    });
    const activation = await db.IntegrationDomainActivation.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      status: 'ACTIVE',
      sourceWatermarkAt: new Date('2026-08-18T23:55:00.000Z'),
      activatedAt,
      activationReason: 'Reviewed scheduler integration test activation.',
      requestId: crypto.randomUUID(),
      previewHash: crypto.createHash('sha256').update(`preview-${suffix}`).digest('hex'),
      previewSnapshot: {},
      authorityPolicyId: authorityPolicy.id
    });
    return { connection, syncState, activation };
  }

  test('queues an incremental run once and defers while that stream already has active work', async () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    const { syncState, activation } = await createEligibleStream({
      suffix: 'incremental',
      activatedAt: new Date('2026-08-18T23:50:00.000Z')
    });
    const first = await scheduleDueBookingSyncs({
      workerId: 'scheduler-worker-a',
      now,
      config: schedulerConfig()
    });
    expect(first.results[0]).toMatchObject({ status: 'SCHEDULED', mode: 'INCREMENTAL' });
    expect(first).toMatchObject({ enabled: true, examined: 1, scheduled: 1, failed: 0 });
    const job = await db.IntegrationJob.findOne({ where: { connectionId: syncState.connectionId } });
    expect(job).toMatchObject({
      jobKind: 'BOOKING_INCREMENTAL',
      status: 'PENDING',
      priority: 20,
      maxAttempts: 10,
      retryBackoffSeconds: 30
    });
    expect(job.payload).toMatchObject({
      mode: 'INCREMENTAL',
      activationId: activation.id,
      checkpointWatermarkAt: '2026-08-18T23:55:00.000Z',
      updatedSince: '2026-08-18T23:55:00.000Z',
      scheduler: {
        policyVersion: '1',
        providerKey: 'vinagent-booking-feed',
        scheduledAt: now.toISOString()
      }
    });
    expect(new Date(job.payload.to).getTime() - new Date(job.payload.from).getTime())
      .toBe(31 * 24 * 60 * 60 * 1000);
    await syncState.reload();
    expect(syncState.nextScheduledAt.toISOString()).toBe('2026-08-19T00:05:00.000Z');
    expect(await db.IntegrationProviderScheduleState.findOne({ where: { domain: 'BOOKING' } }))
      .toMatchObject({
        providerKey: 'vinagent-booking-feed',
        lastConnectionId: syncState.connectionId,
        lastJobKind: 'BOOKING_INCREMENTAL',
        scheduledCount: 1,
        rateWindowScheduledCount: 1
      });

    const second = await scheduleDueBookingSyncs({
      workerId: 'scheduler-worker-b',
      now: new Date('2026-08-19T00:05:00.000Z'),
      config: schedulerConfig()
    });
    expect(second).toMatchObject({ scheduled: 0, failed: 0 });
    expect(second.results[0]).toMatchObject({
      status: 'SKIPPED_OUTSTANDING_JOB',
      outstandingJobId: job.id
    });
    expect(await db.IntegrationJob.count()).toBe(1);
    await syncState.reload();
    expect(syncState.nextScheduledAt.toISOString()).toBe('2026-08-19T00:10:00.000Z');
  });

  test('serializes provider permits across connections and schedules overdue reconciliation', async () => {
    const now = new Date('2026-08-19T02:00:00.000Z');
    const firstStream = await createEligibleStream({
      suffix: 'reconcile-a',
      activatedAt: new Date('2026-08-18T23:00:00.000Z')
    });
    const secondStream = await createEligibleStream({
      suffix: 'reconcile-b',
      activatedAt: new Date('2026-08-18T23:00:00.000Z')
    });
    const thirdStream = await createEligibleStream({
      suffix: 'reconcile-c',
      activatedAt: new Date('2026-08-18T23:00:00.000Z')
    });
    const config = schedulerConfig({
      INTEGRATION_BOOKING_PROVIDER_MINIMUM_SPACING_SECONDS: '30'
    });
    const firstCycle = await scheduleDueBookingSyncs({ workerId: 'scheduler-worker-a', now, config });
    expect(firstCycle.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'SCHEDULED', mode: 'RECONCILIATION' }),
      expect.objectContaining({ status: 'SKIPPED_PROVIDER_SPACING' })
    ]));
    expect(firstCycle.scheduled).toBe(1);
    expect(await db.IntegrationJob.count({ where: { jobKind: 'BOOKING_RECONCILE' } })).toBe(1);

    const secondCycle = await scheduleDueBookingSyncs({
      workerId: 'scheduler-worker-b',
      now: new Date('2026-08-19T02:00:31.000Z'),
      config
    });
    expect(secondCycle).toMatchObject({ scheduled: 1, failed: 0 });
    expect(secondCycle.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'SKIPPED_PROVIDER_RATE_WINDOW' })
    ]));
    expect(await db.IntegrationJob.count({ where: { jobKind: 'BOOKING_RECONCILE' } })).toBe(2);
    const scheduledConnections = (await db.IntegrationJob.findAll({
      where: { jobKind: 'BOOKING_RECONCILE' },
      attributes: ['connectionId']
    })).map(job => job.connectionId).sort();
    expect(scheduledConnections).toEqual([
      firstStream.connection.id,
      secondStream.connection.id
    ].sort());
    expect(scheduledConnections).not.toContain(thirdStream.connection.id);
    expect(await db.IntegrationProviderScheduleState.findOne({ where: { domain: 'BOOKING' } }))
      .toMatchObject({ scheduledCount: 2, rateWindowScheduledCount: 2 });

    const status = await getBookingSyncSchedulerStatus({ wineryId: winery.id, now, config });
    expect(status).toMatchObject({
      enabled: true,
      policyVersion: '1',
      eligibleStreams: 3,
      dueStreams: 0,
      degradedStreams: 0,
      outstandingJobs: 2,
      providerPolicyKeys: []
    });
  });

  test('excludes paused streams from automatic scheduling until an operator resumes them', async () => {
    const now = new Date('2026-08-19T04:00:00.000Z');
    const { syncState } = await createEligibleStream({
      suffix: 'paused',
      activatedAt: new Date('2026-08-18T23:00:00.000Z')
    });
    await syncState.update({
      operationalStatus: 'PAUSED',
      pausedAt: new Date('2026-08-19T03:55:00.000Z'),
      pauseReason: 'Provider maintenance window under manager review.'
    });

    const cycle = await scheduleDueBookingSyncs({
      workerId: 'scheduler-worker-paused',
      now,
      config: schedulerConfig()
    });
    expect(cycle).toMatchObject({ enabled: true, examined: 0, scheduled: 0, results: [] });
    expect(await db.IntegrationJob.count()).toBe(0);

    const status = await getBookingSyncSchedulerStatus({
      wineryId: winery.id,
      now,
      config: schedulerConfig()
    });
    expect(status).toMatchObject({
      eligibleStreams: 0,
      dueStreams: 0,
      pausedStreams: 1,
      outstandingJobs: 0
    });
  });
});
