process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.INTEGRATION_CREDENTIALS_ENABLED = 'true';
process.env.INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID = 'test-v1';
process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS = 'true';
process.env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS = 'feed.example.test:8443';
process.env.INTEGRATION_OPENTABLE_ALLOW_HTTP_FOR_TESTS = 'true';
process.env.INTEGRATION_OPENTABLE_ALLOWED_HOSTS = 'sync.opentable.test:8443,oauth.opentable.test:8443';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const { runIntegrationWorkerCycle } = require('../../services/integrationWorker.service');
const { createConfiguredIntegrationJobHandlerRegistry } = require('../../services/integrationJobHandlers.service');
const { revokeConnectionCredential } = require('../../services/integrationCredential.service');
const { BOOKING_FEED_SCHEMA_VERSION } = require('../../services/integrations/booking/bookingFeed.contract');

describe('protected booking shadow connector routes', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let foreignWinery;
  let manager;
  let location;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Shadow Booking Winery', timeZone: 'Australia/Adelaide' });
    foreignWinery = await db.Winery.create({ name: 'Foreign Shadow Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'shadow-booking-manager',
      email: 'stub@example.com',
      displayName: 'Shadow Booking Manager',
      role: 'manager',
      wineryId: winery.id
    });
    location = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door',
      locationType: 'VENUE'
    });
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  function createFeedConnection(overrides = {}) {
    return request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: overrides.connectionKey || 'booking-feed-primary',
        providerKey: 'vinagent-booking-feed',
        displayName: 'Read-only booking feed',
        externalLocationId: 'cellar-door-provider-id',
        configuration: {
          baseUrl: overrides.baseUrl || 'http://feed.example.test:8443',
          contractVersion: '1',
          shadowMode: true,
          guestDataMode: 'NONE',
          pageSize: 100
        },
        scopes: [{ domain: 'BOOKING', locationId: location.id, isDefault: true }]
      });
  }

  function createOpenTableConnection() {
    return request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: 'opentable-primary',
        providerKey: 'opentable',
        displayName: 'OpenTable Sync',
        externalLocationId: '6789',
        configuration: {
          apiBaseUrl: 'http://sync.opentable.test:8443',
          oauthBaseUrl: 'http://oauth.opentable.test:8443',
          contractVersion: '1',
          shadowMode: true,
          guestDataMode: 'NONE',
          pageSize: 50,
          timeZone: 'Australia/Adelaide',
          experienceMappings: [{
            externalId: '324887',
            code: 'paired-tasting',
            name: 'Paired Tasting',
            durationMinutes: 90
          }],
          addOnMappings: [{
            externalId: '946651ee-4252-4e3d-945f-eafb6f252b86',
            code: 'truffle-pairing',
            label: 'Paired truffle tasting',
            kind: 'ADD_ON'
          }],
          visitTagMappings: []
        },
        scopes: [{ domain: 'BOOKING', locationId: location.id, isDefault: true }]
      });
  }

  function bookingHttpClient({ rejectAuthentication = false } = {}) {
    return {
      get: jest.fn().mockImplementation(async url => {
        if (rejectAuthentication) {
          const error = new Error('provider response must never be persisted');
          error.response = {
            status: 401,
            data: { diagnostic: 'credential do-not-return-secret was rejected' }
          };
          throw error;
        }
        if (url.endsWith('/v1/health')) {
          return {
            data: {
              schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
              status: 'ok',
              accountId: 'booking-account-1',
              locations: [{ id: 'cellar-door-provider-id', name: 'Cellar Door' }]
            }
          };
        }
        return {
          data: {
            schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
            bookings: [{
              id: 'provider-booking-100',
              revision: 'revision-7',
              status: 'CONFIRMED',
              startAt: '2026-08-22T03:30:00.000Z',
              endAt: '2026-08-22T05:00:00.000Z',
              partySize: 6,
              locationId: 'cellar-door-provider-id',
              experience: { code: 'paired-tasting', name: 'Paired Tasting' },
              requirements: [{
                kind: 'ADD_ON',
                code: 'truffle-pairing',
                label: 'Paired truffle tasting',
                quantity: 6
              }],
              guest: {
                externalId: 'guest-99',
                firstName: 'Private',
                lastName: 'Guest',
                email: 'private.guest@example.com',
                phone: '+61400000000'
              },
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-18T00:00:00.000Z',
              deletedAt: null
            }],
            nextCursor: null,
            hasMore: false,
            watermarkAt: '2026-08-18T00:01:00.000Z'
          }
        };
      })
    };
  }

  async function runWorker(httpClient) {
    return runIntegrationWorkerCycle({
      workerId: 'booking-shadow-test-worker',
      handlerRegistry: createConfiguredIntegrationJobHandlerRegistry({ env: process.env, httpClient }),
      outboxService: { dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([]) }
    });
  }

  test('onboards OpenTable OAuth Sync and hydrates through the native adapter boundary', async () => {
    const created = await createOpenTableConnection().expect(201);
    const connectionId = created.body.connection.id;
    expect(created.body.connection).toMatchObject({
      providerKey: 'opentable',
      status: 'PENDING',
      configuration: {
        shadowMode: true,
        guestDataMode: 'NONE',
        timeZone: 'Australia/Adelaide'
      }
    });
    await request(app)
      .put(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .send({
        credentialType: 'OAUTH_CLIENT_CREDENTIALS',
        secret: { clientId: 'opentable-client', clientSecret: 'opentable-client-secret' }
      })
      .expect(201)
      .expect(response => expect(JSON.stringify(response.body)).not.toContain('opentable-client-secret'));

    const httpClient = {
      post: jest.fn().mockResolvedValue({
        data: { access_token: 'opentable-access-token', expires_in: 300, token_type: 'Bearer' }
      }),
      get: jest.fn().mockResolvedValue({
        data: {
          hasNextPage: false,
          nextPageUrl: null,
          offset: 0,
          limit: 50,
          items: [{
            id: 'opentable-booking-1',
            sequence_id: 101,
            rid: 6789,
            guest_id: '6789-private-guest',
            state: 'Confirmed',
            scheduled_time_utc: '2026-08-22T03:30:00Z',
            party_size: 6,
            updated_at_utc: '2026-08-18T00:00:00Z',
            created_date_utc: '2026-08-01T00:00:00Z',
            visit_tags: [],
            guest_request: 'Private text must not be projected.',
            experience_details: {
              experience_id: 324887,
              experience_title: 'Provider title',
              add_ons: [{
                ItemID: '946651ee-4252-4e3d-945f-eafb6f252b86',
                Quantity: 6,
                Name: 'Provider add-on name'
              }]
            }
          }]
        }
      })
    };
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/verify`)
      .set('Authorization', authToken)
      .send({ requestId: crypto.randomUUID() })
      .expect(202);
    expect((await runWorker(httpClient)).jobResults).toEqual([
      expect.objectContaining({ jobKind: 'BOOKING_VERIFY_CONNECTION', status: 'SUCCEEDED' })
    ]);
    expect(await db.IntegrationConnection.findByPk(connectionId)).toMatchObject({ status: 'CONNECTED' });

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
    expect((await runWorker(httpClient)).jobResults).toEqual([
      expect.objectContaining({ jobKind: 'BOOKING_HYDRATE', status: 'SUCCEEDED' })
    ]);
    const [booking, requirement, observation] = await Promise.all([
      db.Booking.findOne({ where: { authorityConnectionId: connectionId } }),
      db.BookingRequirement.findOne({ where: { code: 'truffle-pairing' } }),
      db.ExternalResourceObservation.findOne({ where: { wineryId: winery.id } })
    ]);
    expect(booking).toMatchObject({
      referenceCode: 'opentable-booking-1',
      canonicalStatus: 'CONFIRMED',
      partySize: 6
    });
    expect(requirement).toMatchObject({ kind: 'ADD_ON', code: 'truffle-pairing', quantity: 6 });
    expect(observation.normalizedState).toMatchObject({ guest: null });
    expect(JSON.stringify(observation.normalizedState)).not.toContain('Private text');
    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(httpClient.get.mock.calls.map(call => call[0]))).not.toContain('opentable-access-token');
  });

  test('onboards an encrypted credential, verifies read access, and hydrates non-actioning observations', async () => {
    const connectionResponse = await createFeedConnection().expect(201);
    const connectionId = connectionResponse.body.connection.id;
    expect(connectionResponse.body.connection).toMatchObject({
      providerKey: 'vinagent-booking-feed',
      status: 'PENDING',
      credentialConfigured: false,
      configuration: { shadowMode: true, guestDataMode: 'NONE' }
    });

    const credentialResponse = await request(app)
      .put(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'BEARER_TOKEN', secret: { token: 'do-not-return-secret' } })
      .expect(201);
    expect(credentialResponse.body.credential).toMatchObject({
      configured: true,
      credentialType: 'BEARER_TOKEN',
      status: 'ACTIVE'
    });
    expect(JSON.stringify(credentialResponse.body)).not.toContain('do-not-return-secret');
    const storedCredential = await db.IntegrationCredential.findOne({ where: { connectionId } });
    expect(storedCredential.encryptedPayload).toBeTruthy();
    expect(storedCredential.encryptedPayload).not.toContain('do-not-return-secret');

    const verificationRequestId = crypto.randomUUID();
    const verificationReceipt = await request(app)
      .post(`/api/integration-management/connections/${connectionId}/verify`)
      .set('Authorization', authToken)
      .send({ requestId: verificationRequestId })
      .expect(202);
    expect(verificationReceipt.body.duplicate).toBe(false);
    const duplicateVerification = await request(app)
      .post(`/api/integration-management/connections/${connectionId}/verify`)
      .set('Authorization', authToken)
      .send({ requestId: verificationRequestId })
      .expect(202);
    expect(duplicateVerification.body).toMatchObject({
      duplicate: true,
      job: { id: verificationReceipt.body.job.id }
    });
    const httpClient = bookingHttpClient();
    const verificationCycle = await runWorker(httpClient);
    expect(verificationCycle.jobResults).toEqual([
      expect.objectContaining({ jobKind: 'BOOKING_VERIFY_CONNECTION', status: 'SUCCEEDED' })
    ]);
    const verifiedConnection = await db.IntegrationConnection.findByPk(connectionId);
    expect(verifiedConnection.status).toBe('CONNECTED');
    await storedCredential.reload();
    expect(storedCredential.lastVerificationStatus).toBe('SUCCEEDED');
    expect(await db.IntegrationConnectionCapability.count({
      where: { connectionId, capabilityKey: 'bookings.read.shadow', availabilityStatus: 'AVAILABLE' }
    })).toBe(1);

    const hydrationRequestId = crypto.randomUUID();
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/hydration-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: hydrationRequestId,
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 5
      })
      .expect(202);
    const hydrationCycle = await runWorker(httpClient);
    expect(hydrationCycle.jobResults).toEqual([
      expect.objectContaining({ jobKind: 'BOOKING_HYDRATE', status: 'SUCCEEDED' })
    ]);

    const [reference, observation, event, canonicalEvent, canonicalBooking, requirement, syncRun] = await Promise.all([
      db.ExternalResourceReference.findOne({ where: { connectionId, externalId: 'provider-booking-100' } }),
      db.ExternalResourceObservation.findOne(),
      db.IntegrationEvent.findOne({ where: { connectionId, eventClass: 'SOURCE' } }),
      db.IntegrationEvent.findOne({ where: { connectionId, eventClass: 'CANONICAL' } }),
      db.Booking.findOne({ where: { authorityConnectionId: connectionId } }),
      db.BookingRequirement.findOne({ where: { code: 'truffle-pairing' } }),
      db.IntegrationSyncRun.findOne({ where: { connectionId, status: 'SUCCEEDED' } })
    ]);
    expect(reference).toMatchObject({ resourceType: 'BOOKING', providerVersion: 'revision-7' });
    expect(observation.normalizedState).toMatchObject({
      guest: null,
      requirements: [{ code: 'truffle-pairing', quantity: 6 }]
    });
    expect(event).toMatchObject({
      eventType: 'booking.hydrated',
      ingestionPurpose: 'HYDRATION',
      automationEligible: false,
      rawPayload: null
    });
    expect(canonicalBooking).toMatchObject({
      canonicalStatus: 'CONFIRMED',
      providerStatus: 'CONFIRMED',
      partySize: 6,
      authorityState: 'IMPLICIT_SINGLE_SOURCE',
      qualityState: 'SOURCE_ASSERTED'
    });
    expect(requirement).toMatchObject({
      kind: 'ADD_ON',
      code: 'truffle-pairing',
      quantity: 6,
      sensitivityClass: 'OPERATIONAL',
      isActive: true
    });
    expect(canonicalEvent).toMatchObject({
      eventType: 'booking.confirmed',
      eventClass: 'CANONICAL',
      ingestionPurpose: 'HYDRATION',
      automationEligible: false,
      automationEligibilityReason: 'HYDRATION_IS_NON_ACTIONING'
    });
    expect(syncRun).toMatchObject({ fetchedCount: 1, createdCount: 1, failedCount: 0 });
    expect(await db.CanonicalEventOutbox.count()).toBe(1);
    expect(JSON.stringify(canonicalEvent.normalizedPayload)).not.toContain('private.guest@example.com');
    expect(JSON.stringify(observation.normalizedState)).not.toContain('private.guest@example.com');

    const listedBookings = await request(app)
      .get('/api/integration-management/bookings?status=CONFIRMED')
      .set('Authorization', authToken)
      .expect(200);
    expect(listedBookings.body.bookings).toHaveLength(1);
    const bookingDetail = await request(app)
      .get(`/api/integration-management/bookings/${canonicalBooking.id}`)
      .set('Authorization', authToken)
      .expect(200);
    expect(bookingDetail.body.booking.Requirements).toEqual([
      expect.objectContaining({ code: 'truffle-pairing', description: 'Paired truffle tasting' })
    ]);

    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/hydration-runs`)
      .set('Authorization', authToken)
      .send({
        requestId: crypto.randomUUID(),
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        maxPages: 5
      })
      .expect(202);
    await runWorker(httpClient);
    expect(await db.ExternalResourceReference.count()).toBe(1);
    expect(await db.ExternalResourceObservation.count()).toBe(1);
    expect(await db.IntegrationEvent.count({ where: { connectionId, eventClass: 'SOURCE' } })).toBe(1);
    expect(await db.IntegrationEvent.count({ where: { connectionId, eventClass: 'CANONICAL' } })).toBe(1);
    expect(await db.Booking.count()).toBe(1);
    expect(await db.BookingRequirement.count()).toBe(1);

    const revoked = await request(app)
      .delete(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .expect(200);
    expect(revoked.body.revoked).toBe(true);
    await storedCredential.reload();
    await verifiedConnection.reload();
    expect(storedCredential).toMatchObject({
      status: 'REVOKED',
      encryptedPayload: null,
      initializationVector: null,
      authenticationTag: null
    });
    expect(verifiedConnection).toMatchObject({ status: 'PENDING', authReference: null });
  });

  test('rejects non-allowlisted endpoints and fails closed when credential storage is disabled', async () => {
    await createFeedConnection({
      connectionKey: 'unsafe-feed',
      baseUrl: 'http://127.0.0.1:8443'
    }).expect(400);
    await request(app)
      .post('/api/integration-management/connections')
      .set('Authorization', authToken)
      .send({
        connectionKey: 'unscoped-feed',
        providerKey: 'vinagent-booking-feed',
        displayName: 'Unscoped booking feed',
        externalLocationId: 'cellar-door-provider-id',
        configuration: {
          baseUrl: 'http://feed.example.test:8443',
          contractVersion: '1',
          shadowMode: true,
          guestDataMode: 'NONE',
          pageSize: 100
        },
        scopes: [{ domain: 'CUSTOMER', isDefault: true }]
      })
      .expect(400);
    expect(await db.IntegrationConnection.count()).toBe(0);

    const connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'disabled-store-test',
      providerKey: 'example-bookings',
      displayName: 'Disabled credential store',
      status: 'PENDING',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const previous = process.env.INTEGRATION_CREDENTIALS_ENABLED;
    process.env.INTEGRATION_CREDENTIALS_ENABLED = 'false';
    try {
      const response = await request(app)
        .put(`/api/integration-management/connections/${connection.id}/credential`)
        .set('Authorization', authToken)
        .send({ credentialType: 'API_KEY', secret: { apiKey: 'must-not-persist' } })
        .expect(503);
      expect(JSON.stringify(response.body)).not.toContain('must-not-persist');
      expect(await db.IntegrationCredential.count()).toBe(0);
    } finally {
      process.env.INTEGRATION_CREDENTIALS_ENABLED = previous;
    }
  });

  test('marks rejected credentials for reauthentication without persisting provider diagnostics', async () => {
    const connectionId = (await createFeedConnection().expect(201)).body.connection.id;
    await request(app)
      .put(`/api/integration-management/connections/${connectionId}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'BEARER_TOKEN', secret: { token: 'do-not-return-secret' } })
      .expect(201);
    await request(app)
      .post(`/api/integration-management/connections/${connectionId}/verify`)
      .set('Authorization', authToken)
      .send({ requestId: crypto.randomUUID() })
      .expect(202);

    const cycle = await runWorker(bookingHttpClient({ rejectAuthentication: true }));
    expect(cycle.jobResults).toEqual([
      expect.objectContaining({ status: 'FAILED', errorCode: 'BOOKING_FEED_AUTHENTICATION_REJECTED' })
    ]);
    const [connection, credential, job] = await Promise.all([
      db.IntegrationConnection.findByPk(connectionId),
      db.IntegrationCredential.findOne({ where: { connectionId } }),
      db.IntegrationJob.findOne({ where: { connectionId } })
    ]);
    expect(connection).toMatchObject({
      status: 'REAUTH_REQUIRED',
      lastErrorCode: 'BOOKING_FEED_AUTHENTICATION_REJECTED',
      lastErrorSummary: 'Read-only connection verification failed.'
    });
    expect(credential.lastVerificationStatus).toBe('FAILED');
    expect(job.lastErrorSummary).not.toContain('do-not-return-secret');
    expect(JSON.stringify(connection.toJSON())).not.toContain('provider response must never be persisted');
  });

  test('does not allow one winery to manage another winery credential', async () => {
    const foreignConnection = await db.IntegrationConnection.create({
      wineryId: foreignWinery.id,
      connectionKey: 'foreign-bookings',
      providerKey: 'vinagent-booking-feed',
      displayName: 'Foreign bookings',
      status: 'PENDING'
    });
    const response = await request(app)
      .put(`/api/integration-management/connections/${foreignConnection.id}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'API_KEY', secret: { apiKey: 'foreign-secret' } })
      .expect(404);
    expect(JSON.stringify(response.body)).not.toContain('foreign-secret');
    expect(await db.IntegrationCredential.count()).toBe(0);

    const ownConnectionId = (await createFeedConnection({ connectionKey: 'actor-boundary-test' }).expect(201))
      .body.connection.id;
    await request(app)
      .put(`/api/integration-management/connections/${ownConnectionId}/credential`)
      .set('Authorization', authToken)
      .send({ credentialType: 'API_KEY', secret: { apiKey: 'own-secret' } })
      .expect(201);
    const foreignManager = await db.User.create({
      firebaseUid: 'foreign-shadow-booking-manager',
      email: 'foreign@example.com',
      displayName: 'Foreign Shadow Booking Manager',
      role: 'manager',
      wineryId: foreignWinery.id
    });
    await expect(revokeConnectionCredential({
      wineryId: winery.id,
      connectionId: ownConnectionId,
      actorUserId: foreignManager.id
    })).rejects.toThrow('does not belong to the winery');
    expect(await db.IntegrationCredential.count({
      where: { connectionId: ownConnectionId, status: 'ACTIVE' }
    })).toBe(1);
  });
});
