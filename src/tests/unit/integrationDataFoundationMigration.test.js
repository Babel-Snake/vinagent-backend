const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818000000-create-integration-data-foundation');

describe('integration data foundation migration', () => {
  let sequelize;
  let queryInterface;
  const now = new Date('2026-08-18T00:00:00.000Z');

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();

    await queryInterface.createTable('Wineries', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('OperationalAreas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('IntegrationEvents', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      receivedAt: { type: DataTypes.DATE, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.bulkInsert('Wineries', [{ id: 1 }]);
    await queryInterface.bulkInsert('Users', [{ id: 2, wineryId: 1 }]);
    await queryInterface.bulkInsert('OperationalAreas', [{ id: 3, wineryId: 1 }]);
    await queryInterface.bulkInsert('IntegrationEvents', [{
      id: 4,
      wineryId: 1,
      receivedAt: now,
      createdAt: now,
      updatedAt: now
    }]);
  });

  afterEach(async () => {
    await sequelize.close();
  });

  test('creates reversible provider-neutral integration, sync, provenance, and issue tables', async () => {
    await migration.up(queryInterface, DataTypes);

    const tables = (await queryInterface.showAllTables()).map(String);
    expect(tables).toEqual(expect.arrayContaining([
      'WineryLocations',
      'IntegrationConnections',
      'IntegrationConnectionScopes',
      'IntegrationConnectionCapabilities',
      'IntegrationSyncStates',
      'IntegrationSyncRuns',
      'ExternalResourceReferences',
      'ExternalResourceObservations',
      'ProjectionIssues'
    ]));

    const eventColumns = await queryInterface.describeTable('IntegrationEvents');
    expect(Object.keys(eventColumns)).toEqual(expect.arrayContaining([
      'connectionId',
      'eventScopeKey',
      'idempotencyKey',
      'eventClass',
      'externalResourceReferenceId',
      'ingestionPurpose',
      'automationEligible'
    ]));
    expect((await queryInterface.showIndex('IntegrationEvents')).map(index => index.name))
      .toContain('integration_events_scope_idempotency_unique');

    await queryInterface.bulkInsert('WineryLocations', [{
      id: 10,
      wineryId: 1,
      code: 'cellar-door',
      name: 'Cellar Door',
      locationType: 'VENUE',
      timeZone: 'Australia/Adelaide',
      isActive: true,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('IntegrationConnections', [{
      id: 20,
      wineryId: 1,
      connectionKey: 'bookings-primary',
      providerKey: 'example-bookings',
      displayName: 'Primary booking account',
      status: 'CONNECTED',
      createdBy: 2,
      updatedBy: 2,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('IntegrationConnectionScopes', [{
      id: 30,
      wineryId: 1,
      connectionId: 20,
      domain: 'BOOKING',
      scopeKey: 'location:10',
      locationId: 10,
      priority: 0,
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('IntegrationConnectionCapabilities', [{
      id: 40,
      wineryId: 1,
      connectionId: 20,
      capabilityKey: 'bookings.read',
      kind: 'READ',
      contractVersion: '1',
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      supportsWebhook: true,
      supportsPolling: true,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('IntegrationSyncStates', [{
      id: 50,
      wineryId: 1,
      connectionId: 20,
      resourceType: 'BOOKING',
      streamKey: 'location:10',
      initialBackfillStatus: 'COMPLETE',
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('IntegrationSyncRuns', [{
      id: 60,
      wineryId: 1,
      connectionId: 20,
      syncStateId: 50,
      resourceType: 'BOOKING',
      streamKey: 'location:10',
      mode: 'INCREMENTAL',
      status: 'SUCCEEDED',
      fetchedCount: 1,
      createdCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
      tombstonedCount: 0,
      failedCount: 0,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('ExternalResourceReferences', [{
      id: 70,
      wineryId: 1,
      connectionId: 20,
      resourceType: 'BOOKING',
      externalId: 'booking-123',
      observedAt: now,
      lastSyncRunId: 60,
      resolutionStatus: 'UNRESOLVED',
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('ExternalResourceObservations', [{
      id: 80,
      wineryId: 1,
      externalResourceReferenceId: 70,
      schemaVersion: '1',
      observationKey: 'revision:7',
      normalizedState: JSON.stringify({ status: 'CONFIRMED' }),
      observedAt: now,
      validFrom: now,
      createdAt: now,
      updatedAt: now
    }]);
    await queryInterface.bulkInsert('ProjectionIssues', [{
      id: 90,
      wineryId: 1,
      connectionId: 20,
      externalResourceReferenceId: 70,
      issueType: 'LOCATION_UNMAPPED',
      fingerprint: 'a'.repeat(64),
      status: 'OPEN',
      severity: 'BLOCKING',
      title: 'Booking location is not mapped',
      observationCount: 1,
      detectedAt: now,
      lastObservedAt: now,
      createdAt: now,
      updatedAt: now
    }]);

    await expect(queryInterface.bulkInsert('ExternalResourceReferences', [{
      wineryId: 1,
      connectionId: 20,
      resourceType: 'BOOKING',
      externalId: 'booking-123',
      observedAt: now,
      resolutionStatus: 'UNRESOLVED',
      createdAt: now,
      updatedAt: now
    }])).rejects.toThrow();

    await migration.down(queryInterface);
    const remaining = (await queryInterface.showAllTables()).map(String);
    expect(remaining).not.toEqual(expect.arrayContaining([
      'WineryLocations',
      'IntegrationConnections',
      'IntegrationSyncStates',
      'ExternalResourceReferences',
      'ProjectionIssues'
    ]));
    expect(remaining).toContain('IntegrationEvents');
    expect(await queryInterface.select(null, 'IntegrationEvents')).toHaveLength(1);
    expect(await queryInterface.describeTable('IntegrationEvents')).not.toHaveProperty('eventClass');
  });

  test('can safely resume when the migration has already run', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
  });
});
