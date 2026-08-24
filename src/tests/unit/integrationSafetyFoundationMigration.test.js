const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818100000-create-integration-safety-foundation');

describe('integration safety foundation migration', () => {
  let sequelize;
  let queryInterface;
  const now = new Date('2026-08-18T02:00:00.000Z');

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    const tenantTable = name => queryInterface.createTable(name, {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('Wineries', { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } });
    await tenantTable('Users');
    await tenantTable('OperationalAreas');
    await tenantTable('WineryLocations');
    await tenantTable('IntegrationConnections');
    await tenantTable('IntegrationSyncRuns');
    await tenantTable('IntegrationEvents');
    await tenantTable('Members');
    await tenantTable('AutomationRules');
    await tenantTable('AutomationRuns');

    await queryInterface.bulkInsert('Wineries', [{ id: 1 }]);
    for (const [tableName, id] of [
      ['Users', 2],
      ['OperationalAreas', 3],
      ['WineryLocations', 4],
      ['IntegrationConnections', 5],
      ['IntegrationSyncRuns', 6],
      ['IntegrationEvents', 7],
      ['Members', 8],
      ['AutomationRules', 9],
      ['AutomationRuns', 10]
    ]) {
      await queryInterface.bulkInsert(tableName, [{ id, wineryId: 1 }]);
    }
  });

  afterEach(async () => {
    await sequelize.close();
  });

  test('creates, links, and reverses authority, queue, redirect, and resource safety tables', async () => {
    await migration.up(queryInterface, DataTypes);
    const expectedTables = [
      'DataAuthorityPolicySets',
      'DataAuthorityPolicies',
      'DataAuthorityPolicySources',
      'IntegrationJobs',
      'CanonicalEventOutbox',
      'CustomerMergeRedirects',
      'LocationAreaLinks',
      'OperationalResourceLinks'
    ];
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining(expectedTables));
    expect(await queryInterface.describeTable('DataAuthorityPolicySets')).toHaveProperty('activePolicyId');
    expect((await queryInterface.showIndex('IntegrationJobs')).map(index => index.name))
      .toContain('integration_jobs_unique_idempotency');
    expect((await queryInterface.showIndex('CanonicalEventOutbox')).map(index => index.name))
      .toContain('canonical_event_outbox_unique_event');

    await queryInterface.bulkInsert('DataAuthorityPolicySets', [{
      id: 20,
      wineryId: 1,
      scopeKey: 'winery',
      domain: 'BOOKING',
      fieldGroup: 'STATUS',
      lockVersion: 0,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('DataAuthorityPolicies', [{
      id: 21,
      policySetId: 20,
      wineryId: 1,
      version: 1,
      status: 'ACTIVE',
      resolutionStrategy: 'SOURCE_PRIORITY',
      effectiveFrom: now,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('DataAuthorityPolicySources', [{
      id: 22,
      policyId: 21,
      wineryId: 1,
      connectionId: 5,
      sourceRole: 'PRIMARY',
      sourceOrder: 0,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkUpdate('DataAuthorityPolicySets', { activePolicyId: 21 }, { id: 20 });
    await queryInterface.bulkInsert('IntegrationJobs', [{
      wineryId: 1,
      connectionId: 5,
      jobKind: 'SYNC_RESOURCE',
      jobScopeKey: 'connection:5:resource:booking:stream:main',
      payloadSchemaVersion: '1',
      payload: JSON.stringify({ cursor: null }),
      idempotencyKey: 'sync-1',
      priority: 0,
      status: 'PENDING',
      scheduledAt: now,
      attemptCount: 0,
      maxAttempts: 5,
      retryBackoffSeconds: 60,
      syncRunId: 6,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('CanonicalEventOutbox', [{
      wineryId: 1,
      eventId: 7,
      outboxKey: 'canonical:booking:42:revision:1',
      aggregateType: 'BOOKING',
      aggregateId: '42',
      aggregateRevision: '1',
      status: 'PENDING',
      availableAt: now,
      attemptCount: 0,
      maxAttempts: 10,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('CustomerMergeRedirects', [{
      wineryId: 1,
      sourceMemberId: 99,
      targetMemberId: 8,
      mergedBy: 2,
      mergedAt: now,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('LocationAreaLinks', [{
      wineryId: 1,
      locationId: 4,
      areaId: 3,
      relationshipType: 'PRIMARY_OPERATOR',
      createdBy: 2,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('OperationalResourceLinks', [{
      wineryId: 1,
      itemType: 'TASK',
      itemId: 100,
      resourceType: 'BOOKING',
      resourceId: 42,
      linkType: 'GENERATED_FOR',
      automationRuleId: 9,
      automationRunId: 10,
      sourceEventId: 7,
      createdBy: 2,
      createdAt: now,
      updatedAt: now
    }]);

    await expect(queryInterface.bulkInsert('CanonicalEventOutbox', [{
      wineryId: 1,
      eventId: 7,
      outboxKey: 'another-key',
      aggregateType: 'BOOKING',
      aggregateId: '42',
      aggregateRevision: '2',
      status: 'PENDING',
      availableAt: now,
      attemptCount: 0,
      maxAttempts: 10,
      createdAt: now,
      updatedAt: now
    }])).rejects.toThrow();

    await migration.down(queryInterface);
    const remaining = (await queryInterface.showAllTables()).map(String);
    expect(remaining).not.toEqual(expect.arrayContaining(expectedTables));
    expect(remaining).toContain('IntegrationEvents');
  });

  test('can safely resume after a complete run', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
  });
});
