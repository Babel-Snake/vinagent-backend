process.env.NODE_ENV = 'test';

const db = require('../../models');
const canonicalEventOutboxService = require('../../services/canonicalEventOutbox.service');
const integrationJobService = require('../../services/integrationJob.service');
const { createIntegrationJobHandlerRegistry } = require('../../services/integrationJobHandlerRegistry.service');
const { runIntegrationWorkerCycle } = require('../../services/integrationWorker.service');
const dataAuthorityPolicyService = require('../../services/dataAuthorityPolicy.service');
const customerMergeRedirectService = require('../../services/customerMergeRedirect.service');
const operationalResourceLinkService = require('../../services/operationalResourceLink.service');
const automationRuleService = require('../../services/automationRule.service');

describe('integration safety foundation services', () => {
  let winery;
  let manager;
  let connection;
  let location;
  let sourceMember;
  let targetMember;

  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Safety Foundation Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'safety-foundation-manager',
      email: 'safety@example.com',
      displayName: 'Safety Manager',
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
      connectionKey: 'bookings-primary',
      providerKey: 'example-bookings',
      displayName: 'Booking provider',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    sourceMember = await db.Member.create({ firstName: 'Source', lastName: 'Customer', wineryId: winery.id });
    targetMember = await db.Member.create({ firstName: 'Target', lastName: 'Customer', wineryId: winery.id });
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  test('commits one canonical event and outbox entry and delivers it once', async () => {
    const created = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-42',
      revision: '7',
      normalizedPayload: { status: 'CONFIRMED', partySize: 4 },
      correlationId: 'corr-booking-42'
    });
    expect(created.duplicate).toBe(false);
    expect(created.event.eventClass).toBe('CANONICAL');
    expect(created.event.automationEligible).toBe(true);
    expect(created.outbox.status).toBe('PENDING');
    await expect(automationRuleService.executeMatchingRulesForEvent({
      wineryId: winery.id,
      eventId: created.event.id
    })).rejects.toThrow('must be dispatched through the canonical event outbox');

    const duplicate = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-42',
      revision: '7',
      normalizedPayload: { status: 'CONFIRMED', partySize: 4 }
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event.id).toBe(created.event.id);
    expect(await db.CanonicalEventOutbox.count({ where: { eventId: created.event.id } })).toBe(1);

    const deliver = jest.fn().mockResolvedValue({ consumed: true });
    const results = await canonicalEventOutboxService.dispatchCanonicalOutboxBatch({
      workerId: 'outbox-test-worker',
      deliver
    });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ outboxId: created.outbox.id, status: 'DELIVERED' })
    ]));
    expect(deliver).toHaveBeenCalledTimes(1);
    await created.outbox.reload();
    expect(created.outbox.status).toBe('DELIVERED');
  });

  test('marks hydration events as non-actioning while retaining their canonical lineage', async () => {
    const created = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.hydrated',
      resourceType: 'BOOKING',
      resourceId: 'booking-hydration-1',
      revision: '1',
      normalizedPayload: { status: 'CONFIRMED' },
      ingestionPurpose: 'HYDRATION',
      automationEligible: true
    });
    expect(created.event.automationEligible).toBe(false);
    expect(created.event.automationEligibilityReason).toBe('HYDRATION_IS_NON_ACTIONING');
  });

  test('requires explicit eligibility for reconciliation canonical events', async () => {
    const defaultReconciliation = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.changed',
      resourceType: 'BOOKING',
      resourceId: 'booking-reconciliation-default',
      revision: '1',
      normalizedPayload: { status: 'CONFIRMED' },
      ingestionPurpose: 'RECONCILIATION'
    });
    expect(defaultReconciliation.event).toMatchObject({
      automationEligible: false,
      automationEligibilityReason: 'AUTOMATION_DISABLED_BY_CALLER'
    });
    const eligibleReconciliation = await canonicalEventOutboxService.createCanonicalEvent({
      wineryId: winery.id,
      connectionId: connection.id,
      eventType: 'booking.cancelled',
      resourceType: 'BOOKING',
      resourceId: 'booking-reconciliation-explicit',
      revision: '2',
      normalizedPayload: { status: 'CANCELLED' },
      ingestionPurpose: 'RECONCILIATION',
      automationEligible: true
    });
    expect(eligibleReconciliation.event).toMatchObject({
      automationEligible: true,
      automationEligibilityReason: null
    });
  });

  test('leases jobs, retries with backoff, and only completes for the lease owner', async () => {
    const enqueued = await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'SYNC_RESOURCE',
      resourceType: 'BOOKING',
      streamKey: 'main',
      payload: { cursor: null },
      idempotencyKey: 'booking-sync-1',
      retryBackoffSeconds: 5
    });
    const duplicate = await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'SYNC_RESOURCE',
      resourceType: 'BOOKING',
      streamKey: 'main',
      payload: { cursor: null },
      idempotencyKey: 'booking-sync-1'
    });
    expect(enqueued.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);

    const claimed = await integrationJobService.claimDueIntegrationJobs({ workerId: 'job-worker', leaseSeconds: 30 });
    expect(claimed.map(job => job.id)).toContain(enqueued.job.id);
    const renewedLease = await integrationJobService.renewIntegrationJobLease({
      jobId: enqueued.job.id,
      wineryId: winery.id,
      workerId: 'job-worker',
      leaseSeconds: 30,
      now: new Date('2026-08-18T02:00:00.000Z')
    });
    expect(renewedLease.toISOString()).toBe('2026-08-18T02:00:30.000Z');
    await expect(integrationJobService.renewIntegrationJobLease({
      jobId: enqueued.job.id,
      wineryId: winery.id,
      workerId: 'wrong-worker',
      leaseSeconds: 30
    })).rejects.toThrow('not found');
    await expect(integrationJobService.completeIntegrationJob({
      jobId: enqueued.job.id,
      wineryId: winery.id,
      workerId: 'wrong-worker'
    })).rejects.toThrow('not found');
    const failed = await integrationJobService.failIntegrationJob({
      jobId: enqueued.job.id,
      wineryId: winery.id,
      workerId: 'job-worker',
      errorSummary: 'Temporary provider outage',
      now: new Date('2026-08-18T03:00:00.000Z')
    });
    expect(failed.status).toBe('RETRY');

    const reclaimed = await integrationJobService.claimDueIntegrationJobs({
      workerId: 'job-worker-2',
      now: new Date('2026-08-18T03:00:06.000Z')
    });
    expect(reclaimed.map(job => job.id)).toContain(enqueued.job.id);
    const completed = await integrationJobService.completeIntegrationJob({
      jobId: enqueued.job.id,
      wineryId: winery.id,
      workerId: 'job-worker-2',
      result: { fetched: 3 }
    });
    expect(completed.status).toBe('SUCCEEDED');
  });

  test('runs registered integration jobs and permanently fails unsupported kinds', async () => {
    const successful = await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'SYNC_BOOKINGS',
      resourceType: 'BOOKING',
      payload: { cursor: 'page-1' },
      idempotencyKey: 'worker-success'
    });
    const unsupported = await integrationJobService.enqueueIntegrationJob({
      wineryId: winery.id,
      connectionId: connection.id,
      jobKind: 'UNSUPPORTED_KIND',
      resourceType: 'BOOKING',
      payload: {},
      idempotencyKey: 'worker-unsupported'
    });
    const registry = createIntegrationJobHandlerRegistry();
    registry.register('SYNC_BOOKINGS', async job => ({ cursor: job.payload.cursor, fetched: 4 }));

    const result = await runIntegrationWorkerCycle({
      workerId: 'integration-worker-test',
      handlerRegistry: registry,
      outboxService: { dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([]) }
    });
    expect(result.jobResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: successful.job.id, status: 'SUCCEEDED' }),
      expect.objectContaining({ jobId: unsupported.job.id, status: 'FAILED', errorCode: 'JOB_HANDLER_UNAVAILABLE' })
    ]));
    await successful.job.reload();
    await unsupported.job.reload();
    expect(successful.job).toMatchObject({ status: 'SUCCEEDED', result: { cursor: 'page-1', fetched: 4 } });
    expect(unsupported.job).toMatchObject({
      status: 'FAILED',
      nextAttemptAt: null,
      deadLetteredAt: expect.any(Date),
      lastErrorCode: 'JOB_HANDLER_UNAVAILABLE'
    });
  });

  test('versions and activates scoped authority policies with deterministic precedence', async () => {
    const wineryPolicy = await dataAuthorityPolicyService.createAuthorityPolicyVersion({
      wineryId: winery.id,
      domain: 'BOOKING',
      fieldGroup: 'STATUS',
      resolutionStrategy: 'SOURCE_PRIORITY',
      sources: [{ connectionId: connection.id, sourceRole: 'PRIMARY', sourceOrder: 0 }],
      actorUserId: manager.id
    });
    await dataAuthorityPolicyService.activateAuthorityPolicy({
      policyId: wineryPolicy.id,
      wineryId: winery.id,
      actorUserId: manager.id
    });
    const locationPolicy = await dataAuthorityPolicyService.createAuthorityPolicyVersion({
      wineryId: winery.id,
      locationId: location.id,
      domain: 'BOOKING',
      fieldGroup: 'STATUS',
      resolutionStrategy: 'SOURCE_PRIORITY',
      sources: [{ connectionId: connection.id, sourceRole: 'PRIMARY', sourceOrder: 0 }],
      actorUserId: manager.id
    });
    await dataAuthorityPolicyService.activateAuthorityPolicy({
      policyId: locationPolicy.id,
      wineryId: winery.id,
      actorUserId: manager.id
    });
    const resolved = await dataAuthorityPolicyService.resolveAuthorityPolicy({
      wineryId: winery.id,
      locationId: location.id,
      domain: 'BOOKING',
      fieldGroup: 'STATUS'
    });
    expect(resolved.scopeKey).toBe(`location:${location.id}`);
    expect(resolved.ActivePolicy.id).toBe(locationPolicy.id);
    expect(resolved.ActivePolicy.Sources[0].connectionId).toBe(connection.id);
  });

  test('retargets external customer identities and preserves a late-event redirect', async () => {
    const externalReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'CUSTOMER',
      externalId: 'external-customer-source',
      canonicalType: 'CUSTOMER',
      canonicalId: sourceMember.id,
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    await db.sequelize.transaction(async transaction => {
      await customerMergeRedirectService.recordCustomerMerge({
        wineryId: winery.id,
        sourceMemberId: sourceMember.id,
        targetMemberId: targetMember.id,
        mergedBy: manager.id,
        transaction
      });
      await sourceMember.destroy({ transaction });
    });
    await externalReference.reload();
    expect(externalReference.canonicalId).toBe(targetMember.id);
    const resolved = await customerMergeRedirectService.resolveCustomerRedirect({
      wineryId: winery.id,
      memberId: sourceMember.id
    });
    expect(resolved).toEqual({ memberId: targetMember.id, redirected: true, hops: 1 });
  });

  test('creates tenant-checked, de-duplicated links from work to canonical resources', async () => {
    const task = await db.Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'INTEGRATION_PREPARATION',
      status: 'PENDING'
    });
    const first = await operationalResourceLinkService.createOperationalResourceLink({
      wineryId: winery.id,
      itemType: 'TASK',
      itemId: task.id,
      resourceType: 'CUSTOMER',
      resourceId: targetMember.id,
      linkType: 'ABOUT',
      createdBy: manager.id
    });
    const duplicate = await operationalResourceLinkService.createOperationalResourceLink({
      wineryId: winery.id,
      itemType: 'TASK',
      itemId: task.id,
      resourceType: 'CUSTOMER',
      resourceId: targetMember.id,
      linkType: 'ABOUT',
      createdBy: manager.id
    });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.link.id).toBe(first.link.id);
  });
});
