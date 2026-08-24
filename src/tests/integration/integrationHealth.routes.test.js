process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const integrationHealth = require('../../services/integrationHealth.service');

describe('provider-neutral integration health', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let bookingConnection;
  let inventoryConnection;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Integration Health Winery' });
    manager = await db.User.create({
      firebaseUid: 'integration-health-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Health Manager',
      role: 'manager',
      wineryId: winery.id
    });
    bookingConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'health-booking',
      providerKey: 'fixture-booking',
      displayName: 'Booking fixture',
      status: 'CONNECTED',
      lastHealthCheckedAt: new Date(baseTime - 1000),
      lastHealthyAt: new Date(baseTime - 1000),
      createdBy: manager.id,
      updatedBy: manager.id
    });
    inventoryConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'health-inventory',
      providerKey: 'fixture-inventory',
      displayName: 'Inventory fixture',
      status: 'DEGRADED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await Promise.all([
      db.IntegrationConnectionScope.create({
        wineryId: winery.id,
        connectionId: bookingConnection.id,
        domain: 'BOOKING',
        scopeKey: 'winery',
        isDefault: true
      }),
      db.IntegrationConnectionScope.create({
        wineryId: winery.id,
        connectionId: inventoryConnection.id,
        domain: 'INVENTORY',
        scopeKey: 'winery',
        isDefault: true
      })
    ]);
    await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      resourceType: 'BOOKING',
      externalId: 'health-booking-1',
      canonicalType: 'BOOKING',
      canonicalId: 101,
      resolutionStatus: 'RESOLVED',
      observedAt: new Date(baseTime - 1000)
    });
    const ambiguousInventory = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: inventoryConnection.id,
      resourceType: 'INVENTORY_POSITION',
      externalId: 'health-inventory-1',
      resolutionStatus: 'AMBIGUOUS',
      observedAt: new Date(baseTime - 172800000)
    });
    await db.ProjectionIssue.create({
      wineryId: winery.id,
      connectionId: inventoryConnection.id,
      externalResourceReferenceId: ambiguousInventory.id,
      issueType: 'PRODUCT_UNMAPPED',
      fingerprint: crypto.createHash('sha256').update('health-inventory-issue').digest('hex'),
      status: 'OPEN',
      severity: 'BLOCKING',
      title: 'Inventory product mapping required',
      detectedAt: new Date(baseTime - 1000),
      lastObservedAt: new Date(baseTime - 1000)
    });
    await db.IntegrationSyncState.create({
      wineryId: winery.id,
      connectionId: inventoryConnection.id,
      resourceType: 'INVENTORY_POSITION',
      streamKey: 'positions',
      initialBackfillStatus: 'FAILED',
      operationalStatus: 'ACTIVE',
      consecutiveFailures: 2
    });
  });

  afterAll(async () => db.sequelize.close());

  test('summarizes mappings, freshness, issues, and sync health by canonical domain', async () => {
    const health = await integrationHealth.getIntegrationHealth({
      wineryId: winery.id,
      maxAgeSeconds: 86400,
      recentRunHours: 24,
      now: new Date(baseTime)
    });
    expect(health).toEqual(expect.objectContaining({
      schemaVersion: 'integration.health.v1',
      automationEligible: false,
      summary: expect.objectContaining({
        status: 'BLOCKED',
        connectionCount: 2,
        blockedDomainCount: 1
      })
    }));
    expect(health.domains.find(item => item.domain === 'BOOKING')).toEqual(expect.objectContaining({
      status: 'HEALTHY',
      mappings: expect.objectContaining({
        total: 1,
        resolved: 1,
        resolutionPercent: 100
      })
    }));
    expect(health.domains.find(item => item.domain === 'INVENTORY')).toEqual(expect.objectContaining({
      status: 'BLOCKED',
      mappings: expect.objectContaining({ ambiguous: 1 }),
      freshness: expect.objectContaining({ stale: 1 }),
      projectionIssues: expect.objectContaining({ blocking: 1 }),
      sync: expect.objectContaining({ failingStreamCount: 1 })
    }));
    expect(JSON.stringify(health)).not.toContain('health-inventory-1');
    expect(JSON.stringify(health)).not.toContain('Inventory product mapping required');
  });

  test('supports bounded domain filters and keeps another winery isolated', async () => {
    const response = await request(app)
      .get('/api/integration-management/integration-health')
      .query({ domain: 'BOOKING', maxAgeSeconds: 86400, recentRunHours: 24 })
      .set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.domains).toEqual([
      expect.objectContaining({ domain: 'BOOKING', status: 'HEALTHY' })
    ]);

    const otherWinery = await db.Winery.create({ name: 'Other health winery' });
    const isolated = await integrationHealth.getIntegrationHealth({
      wineryId: otherWinery.id,
      now: new Date(baseTime)
    });
    expect(isolated.summary).toEqual(expect.objectContaining({
      status: 'UNCONFIGURED',
      connectionCount: 0
    }));
    expect(isolated.connections).toEqual([]);
  });
});
