process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const db = require('../../models');

describe('legacy integration compatibility backfill', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let cellarDoor;
  let restaurant;
  let wineClub;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Legacy Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'legacy-backfill-manager',
      email: 'stub@example.com',
      displayName: 'Legacy Backfill Manager',
      role: 'manager',
      wineryId: winery.id
    });
    [cellarDoor, restaurant, wineClub] = await Promise.all([
      db.OperationalArea.create({ wineryId: winery.id, name: 'Cellar Door' }),
      db.OperationalArea.create({ wineryId: winery.id, name: 'Restaurant' }),
      db.OperationalArea.create({ wineryId: winery.id, name: 'Wine Club' })
    ]);
    await db.WineryIntegrationConfig.create({
      wineryId: winery.id,
      bookingProvider: 'opentable',
      crmProvider: 'other',
      posProvider: 'other',
      deliveryProvider: 'other',
      emailProvider: 'other',
      providerConnections: {
        booking: {
          provider: 'Open Table',
          status: 'connected',
          authMethod: 'manual',
          externalAccountId: '',
          externalLocationId: '',
          webhookSecretHash: 'private-legacy-webhook-hash',
          webhookSigningConfigured: true,
          capabilities: ['check_availability', 'receive_webhook']
        },
        crm: { provider: 'other', status: 'not_connected' }
      }
    });
    await Promise.all([
      db.OperationalAreaIntegrationConfig.create({
        wineryId: winery.id,
        areaId: cellarDoor.id,
        providerConnections: {
          booking: {
            provider: 'nowbookit',
            externalLocationId: 'cellar-door-bookings',
            authMethod: 'webhook',
            capabilities: ['check_availability', 'receive_webhook']
          },
          pos: {
            provider: 'square',
            externalLocationId: 'cellar-door-pos',
            authMethod: 'api_key',
            capabilities: ['read_orders', 'read_products']
          }
        }
      }),
      db.OperationalAreaIntegrationConfig.create({
        wineryId: winery.id,
        areaId: restaurant.id,
        providerConnections: {
          booking: {
            provider: 'opentable',
            externalLocationId: 'restaurant-bookings',
            authMethod: 'webhook',
            capabilities: ['check_availability', 'receive_webhook']
          }
        }
      }),
      db.OperationalAreaIntegrationConfig.create({
        wineryId: winery.id,
        areaId: wineClub.id,
        providerConnections: {
          crm: {
            provider: 'commerce7',
            externalAccountId: 'wine-club-account',
            authMethod: 'api_key',
            capabilities: ['read_customers', 'record_order_event']
          }
        }
      })
    ]);
  });

  afterAll(async () => db.sequelize.close());

  test('previews safely, applies pending canonical rows, records ambiguity, and replays idempotently', async () => {
    const preview = await request(app)
      .get('/api/integration-management/compatibility-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(preview.body.summary).toMatchObject({
      sourceEntries: 5,
      candidates: 5,
      create: 5,
      reuse: 0,
      collisions: 0,
      mappingIssues: 1
    });
    expect(preview.body.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerKey: 'square',
        canonicalDomains: ['CATALOG', 'COMMERCE'],
        scopes: expect.arrayContaining([
          expect.objectContaining({ domain: 'CATALOG', areaId: cellarDoor.id }),
          expect.objectContaining({ domain: 'COMMERCE', areaId: cellarDoor.id })
        ])
      }),
      expect.objectContaining({ providerKey: 'opentable', identityStrength: 'SOURCE_ISOLATED' }),
      expect.objectContaining({ providerKey: 'commerce7', externalAccountId: 'wine-club-account' })
    ]));
    expect(preview.body.issues[0]).toMatchObject({
      issueType: 'CONNECTION_MAPPING_AMBIGUOUS',
      providerKey: 'opentable',
      domain: 'BOOKING'
    });
    expect(JSON.stringify(preview.body)).not.toContain('private-legacy-webhook-hash');
    expect(await db.IntegrationConnection.count()).toBe(0);

    const command = {
      requestId: '11111111-1111-4111-8111-111111111111',
      reason: 'Inventory existing legacy integration metadata before controlled connector onboarding.'
    };
    const applied = await request(app)
      .post('/api/integration-management/compatibility-backfill/apply')
      .set('Authorization', auth)
      .send(command)
      .expect(201);
    expect(applied.body).toMatchObject({
      duplicate: false,
      report: {
        createdConnectionIds: expect.any(Array),
        reusedConnectionIds: [],
        createdScopes: 6,
        reusedScopes: 0,
        mappingIssueIds: expect.any(Array)
      }
    });
    expect(applied.body.report.createdConnectionIds).toHaveLength(5);
    expect(applied.body.report.mappingIssueIds).toHaveLength(1);

    const connections = await db.IntegrationConnection.findAll({ where: { wineryId: winery.id } });
    expect(connections).toHaveLength(5);
    for (const connection of connections) {
      expect(connection).toMatchObject({ status: 'PENDING', authReference: null });
      expect(connection.lastErrorCode).toBe('LEGACY_CREDENTIAL_ONBOARDING_REQUIRED');
      expect(JSON.stringify(connection.toJSON())).not.toContain('private-legacy-webhook-hash');
    }
    expect(await db.IntegrationConnectionScope.count({ where: { wineryId: winery.id } })).toBe(6);
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'CONNECTION_MAPPING_AMBIGUOUS', status: 'OPEN' }
    })).toBe(1);
    expect(await db.IntegrationOperationAuditEvent.count({
      where: { wineryId: winery.id, action: 'LEGACY_CONNECTION_BACKFILL_APPLIED' }
    })).toBe(1);
    const legacy = await db.WineryIntegrationConfig.findOne({ where: { wineryId: winery.id } });
    expect(legacy.providerConnections.booking.webhookSecretHash).toBe('private-legacy-webhook-hash');

    const replay = await request(app)
      .post('/api/integration-management/compatibility-backfill/apply')
      .set('Authorization', auth)
      .send(command)
      .expect(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.report.createdConnectionIds).toEqual(applied.body.report.createdConnectionIds);
    expect(await db.IntegrationConnection.count({ where: { wineryId: winery.id } })).toBe(5);

    const after = await request(app)
      .get('/api/integration-management/compatibility-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(after.body.summary).toMatchObject({ create: 0, reuse: 5, collisions: 0 });
    const issues = await request(app)
      .get('/api/integration-management/compatibility-backfill/issues?status=OPEN')
      .set('Authorization', auth)
      .expect(200);
    expect(issues.body.pagination.total).toBe(1);
    expect(JSON.stringify(issues.body)).not.toContain('private-legacy-webhook-hash');

    const cellarConfig = await db.OperationalAreaIntegrationConfig.findOne({ where: { areaId: cellarDoor.id } });
    await cellarConfig.update({ providerConnections: { booking: cellarConfig.providerConnections.booking } });
    const stalePreview = await request(app)
      .get('/api/integration-management/compatibility-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(stalePreview.body.summary).toMatchObject({
      candidates: 4,
      create: 0,
      reuse: 4,
      staleConnections: 1,
      mappingIssues: 2
    });
    const refreshed = await request(app)
      .post('/api/integration-management/compatibility-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId: '33333333-3333-4333-8333-333333333333',
        reason: 'Refresh the inventory after removing a legacy area POS source from configuration.'
      })
      .expect(201);
    expect(refreshed.body.report.staleConnectionIds).toHaveLength(1);
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'CONNECTION_MAPPING_STALE' }
    })).toBe(1);
    expect(await db.IntegrationConnection.count({ where: { wineryId: winery.id } })).toBe(5);
  });

  test('never overwrites a non-backfill connection on a deterministic key collision', async () => {
    const preview = await request(app)
      .get('/api/integration-management/compatibility-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    const candidate = preview.body.candidates.find(item => item.providerKey === 'square');
    const existing = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: candidate.connectionKey,
      providerKey: 'square',
      displayName: 'Manager-owned Square connection',
      status: 'DISABLED',
      configuration: { managerOwned: true },
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const result = await request(app)
      .post('/api/integration-management/compatibility-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId: '22222222-2222-4222-8222-222222222222',
        reason: 'Confirm collision handling preserves the existing manager-owned canonical connection.'
      })
      .expect(201);
    expect(result.body.planSummary.collisions).toBe(1);
    expect(result.body.report.skippedCollisionKeys).toEqual([candidate.connectionKey]);
    await existing.reload();
    expect(existing).toMatchObject({
      displayName: 'Manager-owned Square connection',
      status: 'DISABLED',
      configuration: { managerOwned: true }
    });
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'SOURCE_CONFLICT', severity: 'BLOCKING' }
    })).toBe(1);
  });
});
