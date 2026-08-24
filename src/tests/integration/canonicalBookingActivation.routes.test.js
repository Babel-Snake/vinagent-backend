process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.INTEGRATION_CREDENTIALS_ENABLED = 'true';
process.env.INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID = 'test-v1';
process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString('base64');
process.env.INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS = 'true';
process.env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS = 'canonical.example.test:8443';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const { runIntegrationWorkerCycle } = require('../../services/integrationWorker.service');
const { createConfiguredIntegrationJobHandlerRegistry } = require('../../services/integrationJobHandlers.service');
const { BOOKING_FEED_SCHEMA_VERSION } = require('../../services/integrations/booking/bookingFeed.contract');
const { buildEventScopeKey } = require('../../services/integrationDataFoundation.service');
const { projectBookingObservation } = require('../../services/bookingProjection.service');

describe('canonical booking projection and activation', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let location;
  let area;
  let staff;
  let connectionId;
  let feedBooking;
  let pollPages;
  let feedRequests;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Canonical Booking Winery', timeZone: 'Australia/Adelaide' });
    await db.User.create({
      firebaseUid: 'canonical-booking-manager',
      email: 'stub@example.com',
      displayName: 'Canonical Booking Manager',
      role: 'manager',
      wineryId: winery.id
    });
    staff = await db.User.create({
      firebaseUid: 'canonical-booking-stock-owner',
      email: 'stock-owner@example.com',
      displayName: 'Stock Owner',
      role: 'staff',
      wineryId: winery.id
    });
    area = await db.OperationalArea.create({
      wineryId: winery.id,
      code: 'cellar-door-operations',
      name: 'Cellar Door Operations'
    });
    location = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door',
      locationType: 'VENUE'
    });
    await db.LocationAreaLink.create({
      wineryId: winery.id,
      locationId: location.id,
      areaId: area.id,
      relationshipType: 'PRIMARY_OPERATOR'
    });
    feedBooking = {
      id: 'booking-activation-1',
      revision: 'revision-1',
      status: 'CONFIRMED',
      startAt: '2026-08-22T03:30:00.000Z',
      endAt: '2026-08-22T05:00:00.000Z',
      partySize: 6,
      locationId: 'provider-cellar-door',
      experience: { code: 'paired-tasting', name: 'Paired Tasting' },
      requirements: [
        { kind: 'ADD_ON', code: 'truffle-pairing', label: 'Paired truffle tasting', quantity: 6 },
        { kind: 'DIETARY', code: 'private-dietary-code', label: 'Private dietary detail', quantity: 1 }
      ],
      guest: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
      deletedAt: null
    };
    pollPages = {};
    feedRequests = [];
  });

  afterAll(async () => db.sequelize.close());

  function httpClient() {
    return {
      get: jest.fn().mockImplementation(async (url, options = {}) => {
        if (url.endsWith('/v1/health')) {
          return {
            data: {
              schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
              status: 'ok',
              accountId: 'canonical-account',
              locations: [{ id: 'provider-cellar-door', name: 'Cellar Door' }]
            }
          };
        }
        feedRequests.push(options.params || {});
        const mode = options.params?.sync_mode || 'hydration';
        if (pollPages[mode]) return { data: pollPages[mode] };
        return {
          data: {
            schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
            bookings: [feedBooking],
            nextCursor: null,
            hasMore: false,
            watermarkAt: '2026-08-18T00:01:00.000Z'
          }
        };
      })
    };
  }

  async function runWorker({ dispatchOutbox = false } = {}) {
    const options = {
      workerId: 'canonical-booking-worker',
      handlerRegistry: createConfiguredIntegrationJobHandlerRegistry({ env: process.env, httpClient: httpClient() })
    };
    if (!dispatchOutbox) {
      options.outboxService = { dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([]) };
    }
    return runIntegrationWorkerCycle(options);
  }

  async function createAndVerifyConnection() {
    const created = await request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: 'canonical-bookings',
        providerKey: 'vinagent-booking-feed',
        displayName: 'Canonical booking feed',
        externalLocationId: 'provider-cellar-door',
        configuration: {
          baseUrl: 'http://canonical.example.test:8443',
          contractVersion: '1',
          shadowMode: true,
          guestDataMode: 'NONE',
          pageSize: 100
        },
        scopes: [{ domain: 'BOOKING', locationId: location.id, isDefault: true }]
      })
      .expect(201);
    connectionId = created.body.connection.id;
    await request(app)
      .put(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'API_KEY', secret: { apiKey: 'canonical-secret' } })
      .expect(201);
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/verify`)
      .set('Authorization', authToken)
      .send({ requestId: crypto.randomUUID() })
      .expect(202);
    await runWorker();
  }

  async function hydrate() {
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/hydration-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 2
      })
      .expect(202);
    await runWorker();
  }

  async function activatePrimaryAuthorityPolicy() {
    const created = await request(app)
      .post('/api/integration-management/authority-policies')
      .set('Authorization', authToken)
      .send({
        locationId: location.id,
        domain: 'BOOKING',
        fieldGroup: 'CORE',
        resolutionStrategy: 'SOURCE_PRIORITY',
        sources: [{ connectionId, sourceRole: 'PRIMARY', sourceOrder: 0 }]
      })
      .expect(201);
    await request(app)
      .post(`/api/integration-management/authority-policies/${created.body.policy.id}/activate`)
      .set('Authorization', authToken)
      .send({ effectiveAt: '2026-08-18T00:00:00.000Z' })
      .expect(200);
    return created.body.policy.id;
  }

  async function projectDirectRevision({ revision, partySize, ingestionPurpose, providerUpdatedAt }) {
    const [connection, reference] = await Promise.all([
      db.IntegrationConnection.findByPk(connectionId),
      db.ExternalResourceReference.findOne({ where: { connectionId, externalId: feedBooking.id } })
    ]);
    const normalized = {
      externalId: feedBooking.id,
      revision,
      status: 'CONFIRMED',
      startAt: feedBooking.startAt,
      endAt: feedBooking.endAt,
      partySize,
      externalLocationId: feedBooking.locationId,
      experience: feedBooking.experience,
      requirements: feedBooking.requirements.map(item => ({
        kind: item.kind,
        code: item.code,
        label: item.label,
        quantity: item.quantity
      })),
      guest: null,
      providerCreatedAt: feedBooking.createdAt,
      providerUpdatedAt,
      deletedAt: null,
      sourceHash: crypto.createHash('sha256').update(`${revision}:${partySize}`).digest('hex')
    };
    return db.sequelize.transaction(async transaction => {
      const sourceEvent = await db.IntegrationEvent.create({
        wineryId: winery.id,
        connectionId,
        provider: connection.providerKey,
        intakeMethod: 'connector_test',
        eventType: 'booking.source.changed',
        rawPayload: null,
        normalizedPayload: normalized,
        status: 'PROCESSED',
        receivedAt: new Date(Date.now() + 1000),
        processedAt: new Date(),
        eventScopeKey: buildEventScopeKey({ connectionId, sourceStream: `booking-live:${feedBooking.id}` }),
        idempotencyKey: revision,
        eventClass: 'SOURCE',
        schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
        occurredAtSource: new Date(providerUpdatedAt),
        providerEventVersion: revision,
        externalResourceReferenceId: reference.id,
        ingestionPurpose,
        automationEligible: false,
        automationEligibilityReason: 'SOURCE_EVENTS_DO_NOT_DISPATCH_DIRECTLY'
      }, { transaction });
      return projectBookingObservation({ connection, reference, sourceEvent, booking: normalized, transaction });
    });
  }

  test('requires authority alignment, activates non-retroactively, and gates later live canonical events', async () => {
    await createAndVerifyConnection();
    await hydrate();

    const beforePolicy = await request(app)
      .get(`/api/integration-management/connections/${connectionId}/booking-activation-preview`)
      .set('Authorization', authToken)
      .expect(200);
    expect(beforePolicy.body).toMatchObject({
      ready: false,
      sourceReferenceCount: 1,
      projectedReferenceCount: 1
    });
    expect(beforePolicy.body.reasons).toContain('BOOKING_CORE_AUTHORITY_POLICY_REQUIRED');

    const policyId = await activatePrimaryAuthorityPolicy();
    const beforeAlignment = await request(app)
      .get(`/api/integration-management/connections/${connectionId}/booking-activation-preview`)
      .set('Authorization', authToken)
      .expect(200);
    expect(beforeAlignment.body.reasons).toContain('CANONICAL_BOOKINGS_NOT_ALIGNED_TO_AUTHORITY_POLICY');

    await hydrate();
    const preview = await request(app)
      .get(`/api/integration-management/connections/${connectionId}/booking-activation-preview`)
      .set('Authorization', authToken)
      .expect(200);
    expect(preview.body).toMatchObject({
      ready: true,
      reasons: [],
      authorityPolicyId: policyId,
      authorityAlignedBookingCount: 1,
      sourceWatermarkAt: '2026-08-18T00:01:00.000Z'
    });

    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/booking-activation`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: `${preview.body.previewToken[0] === '0' ? '1' : '0'}${preview.body.previewToken.slice(1)}`,
        reason: 'Intentionally stale activation preview token.',
        acknowledgeNonRetroactive: true
      })
      .expect(400);

    const activationRequest = {
      requestId: crypto.randomUUID(),
      previewToken: preview.body.previewToken,
      reason: 'Enable future booking canonical events after reviewed hydration.',
      acknowledgeNonRetroactive: true
    };
    const activated = await request(app)
      .post(`/api/integration-management/connections/${connectionId}/booking-activation`)
      .set('Authorization', authToken)
      .send(activationRequest)
      .expect(201);
    expect(activated.body).toMatchObject({
      duplicate: false,
      activation: {
        status: 'ACTIVE',
        sourceWatermarkAt: '2026-08-18T00:01:00.000Z',
        authorityPolicyId: policyId
      }
    });
    expect((await db.IntegrationSyncState.findOne({ where: { connectionId } })).nextScheduledAt.toISOString())
      .toBe(new Date(activated.body.activation.activatedAt).toISOString());
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/booking-activation`)
      .set('Authorization', authToken)
      .send(activationRequest)
      .expect(200)
      .expect(response => expect(response.body.duplicate).toBe(true));

    const liveProjection = await projectDirectRevision({
      revision: 'revision-live-2',
      partySize: 7,
      ingestionPurpose: 'LIVE',
      providerUpdatedAt: '2026-08-18T01:00:00.000Z'
    });
    expect(liveProjection).toMatchObject({ status: 'UPDATED', automationEligible: true });
    expect(liveProjection.canonicalEvent).toMatchObject({
      eventType: 'booking.changed',
      ingestionPurpose: 'LIVE',
      automationEligible: true,
      automationEligibilityReason: null
    });
    expect(JSON.stringify(liveProjection.canonicalEvent.normalizedPayload)).not.toContain('private-dietary-code');

    const laterHydration = await projectDirectRevision({
      revision: 'revision-hydration-3',
      partySize: 8,
      ingestionPurpose: 'HYDRATION',
      providerUpdatedAt: '2026-08-18T02:00:00.000Z'
    });
    expect(laterHydration).toMatchObject({ status: 'UPDATED', automationEligible: false });
    expect(laterHydration.canonicalEvent).toMatchObject({
      ingestionPurpose: 'HYDRATION',
      automationEligible: false,
      automationEligibilityReason: 'HYDRATION_IS_NON_ACTIONING'
    });
    const canonicalCountBeforeOlderRevision = await db.IntegrationEvent.count({ where: { eventClass: 'CANONICAL' } });
    const olderProjection = await projectDirectRevision({
      revision: 'revision-older-4',
      partySize: 99,
      ingestionPurpose: 'LIVE',
      providerUpdatedAt: '2026-08-18T01:30:00.000Z'
    });
    expect(olderProjection).toMatchObject({ status: 'OUT_OF_ORDER', canonicalEvent: null });
    expect(await db.IntegrationEvent.count({ where: { eventClass: 'CANONICAL' } }))
      .toBe(canonicalCountBeforeOlderRevision);
    expect(await db.Booking.findOne({ where: { wineryId: winery.id } }))
      .toMatchObject({ partySize: 8 });
    expect(await db.Task.count()).toBe(0);

    const booking = await db.Booking.findOne({ where: { wineryId: winery.id } });
    const detail = await request(app)
      .get(`/api/integration-management/bookings/${booking.id}`)
      .set('Authorization', authToken)
      .expect(200);
    const restricted = detail.body.booking.Requirements.find(item => item.sensitivityClass === 'RESTRICTED');
    expect(restricted).toMatchObject({ kind: 'DIETARY', detailsRestricted: true });
    expect(restricted).not.toHaveProperty('code');
    expect(restricted).not.toHaveProperty('description');

    await request(app)
      .put(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'API_KEY', secret: { apiKey: 'rotated-canonical-secret' } })
      .expect(201);
    expect(await db.IntegrationDomainActivation.findOne({ where: { connectionId } }))
      .toMatchObject({ status: 'DISABLED', disabledReason: 'Connection credential changed after activation.' });
    expect(await db.IntegrationConnectionCapability.findOne({
      where: { connectionId, capabilityKey: 'bookings.canonical.events.live' }
    })).toMatchObject({ enabled: false, availabilityStatus: 'UNAVAILABLE' });
    const afterCredentialChange = await projectDirectRevision({
      revision: 'revision-after-credential-change',
      partySize: 9,
      ingestionPurpose: 'LIVE',
      providerUpdatedAt: '2026-08-18T03:00:00.000Z'
    });
    expect(afterCredentialChange.canonicalEvent).toMatchObject({
      automationEligible: false,
      automationEligibilityReason: 'BOOKING_CONNECTION_NOT_CONNECTED'
    });
  });

  test('retains source evidence but blocks canonical projection when booking core is VinAgent-owned', async () => {
    await createAndVerifyConnection();
    const policy = await request(app)
      .post('/api/integration-management/authority-policies')
      .set('Authorization', authToken)
      .send({
        locationId: location.id,
        domain: 'BOOKING',
        fieldGroup: 'CORE',
        resolutionStrategy: 'VINAGENT_OWNED',
        sources: []
      })
      .expect(201);
    await request(app)
      .post(`/api/integration-management/authority-policies/${policy.body.policy.id}/activate`)
      .set('Authorization', authToken)
      .send({ effectiveAt: '2026-08-18T00:00:00.000Z' })
      .expect(200);

    await hydrate();
    expect(await db.ExternalResourceObservation.count()).toBe(1);
    expect(await db.Booking.count()).toBe(0);
    expect(await db.IntegrationEvent.count({ where: { eventClass: 'CANONICAL' } })).toBe(0);
    expect(await db.ProjectionIssue.findOne({ where: { issueType: 'SOURCE_CONFLICT' } }))
      .toMatchObject({ severity: 'BLOCKING', status: 'OPEN' });
    const preview = await request(app)
      .get(`/api/integration-management/connections/${connectionId}/booking-activation-preview`)
      .set('Authorization', authToken)
      .expect(200);
    expect(preview.body.ready).toBe(false);
    expect(preview.body.reasons).toEqual(expect.arrayContaining([
      'BOOKING_CORE_MUST_USE_SOURCE_PRIORITY',
      'SHADOW_BOOKINGS_NOT_FULLY_PROJECTED',
      'BLOCKING_PROJECTION_ISSUES_EXIST'
    ]));
  });

  test('polls incrementally, resolves readiness context, and creates one manager-approved truffle task', async () => {
    await createAndVerifyConnection();
    await hydrate();
    await activatePrimaryAuthorityPolicy();
    await hydrate();
    const preview = await request(app)
      .get(`/api/integration-management/connections/${connectionId}/booking-activation-preview`)
      .set('Authorization', authToken)
      .expect(200);
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/booking-activation`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: preview.body.previewToken,
        reason: 'Enable reviewed future booking polling for the cellar door.',
        acknowledgeNonRetroactive: true
      })
      .expect(201);

    const templates = await request(app)
      .get('/api/automations/templates')
      .set('Authorization', authToken)
      .expect(200);
    expect(templates.body.templates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'booking.truffle_preparation.v1', requiresManagerActivation: true })
    ]));
    const installed = await request(app)
      .post('/api/automations/templates/booking.truffle_preparation.v1/rules')
      .set('Authorization', authToken)
      .send({ assigneeId: staff.id, areaId: area.id, leadTimeMinutes: 2880 })
      .expect(201);
    expect(installed.body.rule.status).toBe('DRAFT');
    await request(app)
      .patch(`/api/automations/rules/${installed.body.rule.id}/status`)
      .set('Authorization', authToken)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const liveBooking = {
      ...feedBooking,
      id: 'booking-live-truffle-2',
      revision: 'live-revision-1',
      updatedAt: '2026-08-18T00:02:00.000Z'
    };
    pollPages.incremental = {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [liveBooking],
      nextCursor: null,
      hasMore: false,
      watermarkAt: '2026-08-18T00:03:00.000Z'
    };
    const incrementalRequestId = crypto.randomUUID();
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/incremental-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: incrementalRequestId,
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 2,
        overlapMinutes: 5
      })
      .expect(202);
    const incrementalCycle = await runWorker({ dispatchOutbox: true });
    expect(incrementalCycle.jobResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobKind: 'BOOKING_INCREMENTAL', status: 'SUCCEEDED' })
    ]));

    const liveCanonicalEvent = await db.IntegrationEvent.findOne({
      where: { eventClass: 'CANONICAL', eventType: 'booking.confirmed', ingestionPurpose: 'LIVE' },
      order: [['id', 'DESC']]
    });
    expect(liveCanonicalEvent).toMatchObject({ automationEligible: true, automationEligibilityReason: null });
    expect(feedRequests.find(item => item.sync_mode === 'incremental')).toMatchObject({
      updated_since: '2026-08-18T00:01:00.000Z'
    });

    const liveCanonicalBooking = await db.Booking.findOne({ where: { referenceCode: liveBooking.id } });
    const automationRuns = await db.AutomationRun.findAll();
    expect(automationRuns.map(run => ({ status: run.status, error: run.error })))
      .toEqual([{ status: 'ACTIONED', error: null }]);
    const task = await db.Task.findOne({ where: { wineryId: winery.id } });
    expect(task).toMatchObject({
      assigneeId: staff.id,
      category: 'OPERATIONS',
      subType: 'OPERATIONS_SUPPLY_REQUEST',
      priority: 'high'
    });
    expect(task.payload).toMatchObject({
      automationPurpose: 'booking.truffle_preparation',
      bookingId: liveCanonicalBooking.id,
      bookingReference: liveBooking.id,
      requiredQuantity: 6,
      quantityUnit: 'portion',
      inventoryConclusion: 'UNKNOWN'
    });
    expect(task.suggestedAction).toContain('prepare 6 truffle-pairing portions');
    expect(await db.OperationalResourceLink.findOne({ where: { itemType: 'TASK', itemId: task.id } }))
      .toMatchObject({
        resourceType: 'BOOKING',
        resourceId: liveCanonicalBooking.id,
        linkType: 'GENERATED_FOR',
        metadata: expect.objectContaining({ purposeKey: 'booking.truffle_preparation' })
      });
    let lifecycleBinding = await db.AutomationResourceBinding.findOne({
      where: { itemType: 'TASK', itemId: task.id }
    });
    expect(lifecycleBinding).toMatchObject({
      ruleId: installed.body.rule.id,
      resourceType: 'BOOKING',
      resourceId: liveCanonicalBooking.id,
      purposeKey: 'booking.truffle_preparation',
      lifecycleState: 'ACTIVE',
      lastDecision: 'CREATED',
      reconciliationPolicy: expect.objectContaining({
        onChange: 'UPDATE_MANAGED',
        onCancel: 'CANCEL_IF_UNTOUCHED',
        onUnsafe: 'ANNOTATE'
      })
    });
    const bindingList = await request(app)
      .get(`/api/automations/bindings?resourceType=BOOKING&resourceId=${liveCanonicalBooking.id}`)
      .set('Authorization', authToken)
      .expect(200);
    expect(bindingList.body.bindings).toEqual([
      expect.objectContaining({ id: lifecycleBinding.id, itemId: task.id, lifecycleState: 'ACTIVE' })
    ]);
    const readinessStep = await db.AutomationRunStep.findOne({ where: { capability: 'booking.readiness.v1' } });
    expect(readinessStep.output).toMatchObject({
      preparation: { trufflePairing: { required: true, quantity: 6 } },
      inventory: { status: 'UNKNOWN', code: 'INVENTORY_DEMAND_UNMAPPED', calculationReliable: false },
      workforce: {
        status: 'UNKNOWN',
        code: 'WORKFORCE_DEMAND_UNMAPPED',
        calculationReliable: false,
        demandCount: 0,
        gapCount: 0,
        contextVersion: 'booking.coverage.v1'
      },
      requirements: { restrictedCount: 1 },
      openWork: { hasTrufflePreparationBinding: false }
    });
    expect(JSON.stringify(readinessStep.output)).not.toContain('private-dietary-code');

    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/incremental-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: incrementalRequestId,
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 2,
        overlapMinutes: 5
      })
      .expect(202)
      .expect(response => expect(response.body.duplicate).toBe(true));
    expect(await db.Task.count()).toBe(1);

    const changedBooking = {
      ...liveBooking,
      revision: 'live-revision-2',
      startAt: '2026-08-23T03:30:00.000Z',
      endAt: '2026-08-23T05:00:00.000Z',
      requirements: liveBooking.requirements.map(requirement => (
        requirement.code === 'truffle-pairing' ? { ...requirement, quantity: 8 } : requirement
      )),
      updatedAt: '2026-08-18T00:04:00.000Z'
    };
    pollPages.incremental = {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [changedBooking],
      nextCursor: null,
      hasMore: false,
      watermarkAt: '2026-08-18T00:05:00.000Z'
    };
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/incremental-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 2,
        overlapMinutes: 5
      })
      .expect(202);
    await runWorker({ dispatchOutbox: true });
    expect(await task.reload()).toMatchObject({
      status: 'PENDING',
      suggestedAction: expect.stringContaining('prepare 8 truffle-pairing portions')
    });
    expect(task.payload).toMatchObject({ requiredQuantity: 8 });
    expect(task.dueAt.toISOString()).toBe('2026-08-21T03:30:00.000Z');
    lifecycleBinding = await lifecycleBinding.reload();
    expect(lifecycleBinding).toMatchObject({ lifecycleState: 'ACTIVE', lastDecision: 'UPDATED' });
    expect(await db.TaskAction.findOne({ where: { taskId: task.id, actionType: 'UPDATED_PAYLOAD' } }))
      .toMatchObject({ userId: null, details: expect.objectContaining({ source: 'automation_resource_binding' }) });

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', authToken)
      .send({ suggestedAction: 'Staff-owned preparation plan after checking the cool room.' })
      .expect(200);

    pollPages.reconciliation = {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [{
        ...liveBooking,
        revision: 'reconciliation-cancel-2',
        status: 'CANCELLED',
        updatedAt: '2026-08-18T00:06:00.000Z',
        deletedAt: '2026-08-18T00:06:00.000Z'
      }],
      nextCursor: null,
      hasMore: false,
      watermarkAt: '2026-08-18T00:07:00.000Z',
      snapshotComplete: true
    };
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/reconciliation-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 2
      })
      .expect(202);
    await runWorker({ dispatchOutbox: true });
    expect(await liveCanonicalBooking.reload()).toMatchObject({ canonicalStatus: 'CANCELLED', isSourceDeleted: true });
    const reconciliationEvent = await db.IntegrationEvent.findOne({
      where: { eventClass: 'CANONICAL', ingestionPurpose: 'RECONCILIATION' }
    });
    expect(reconciliationEvent).toMatchObject({ eventType: 'booking.cancelled', automationEligible: true });
    expect(await db.Task.count()).toBe(1);
    expect(await task.reload()).toMatchObject({
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      suggestedAction: 'Staff-owned preparation plan after checking the cool room.'
    });
    expect(await lifecycleBinding.reload()).toMatchObject({
      lifecycleState: 'HUMAN_OWNED',
      lastDecision: 'ANNOTATED',
      humanOverrideReason: expect.stringMatching(/HUMAN_MANUAL_UPDATE|MANAGED_FIELDS_CHANGED/)
    });
    expect(await db.TaskAction.findOne({
      where: { taskId: task.id, actionType: 'NOTE_ADDED' },
      order: [['id', 'DESC']]
    })).toMatchObject({
      userId: null,
      details: expect.objectContaining({
        source: 'automation_resource_binding',
        reason: 'BOOKING_CANCELLED'
      })
    });
    expect((await db.IntegrationSyncRun.findAll({ order: [['id', 'ASC']] })).map(run => run.mode))
      .toEqual(['BACKFILL', 'BACKFILL', 'INCREMENTAL', 'INCREMENTAL', 'RECONCILIATION']);
  });
});
