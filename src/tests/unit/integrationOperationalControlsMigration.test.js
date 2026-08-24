const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818600000-create-integration-operational-controls');

describe('integration operational controls migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('Wineries', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('IntegrationConnections', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('IntegrationSyncStates', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      connectionId: { type: DataTypes.INTEGER, allowNull: false },
      resourceType: { type: DataTypes.STRING(120), allowNull: false },
      streamKey: { type: DataTypes.STRING(180), allowNull: false }
    });
    await queryInterface.createTable('IntegrationJobs', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.createTable('CanonicalEventOutbox', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  });

  afterEach(async () => sequelize.close());

  test('adds resumable stream controls, replay lineage, dead-letter metadata, and immutable audit events', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();

    expect(await queryInterface.describeTable('IntegrationSyncStates')).toEqual(expect.objectContaining({
      operationalStatus: expect.any(Object),
      pausedAt: expect.any(Object),
      pausedBy: expect.any(Object),
      pauseReason: expect.any(Object)
    }));
    expect(await queryInterface.describeTable('IntegrationJobs')).toEqual(expect.objectContaining({
      deadLetteredAt: expect.any(Object),
      replayedFromJobId: expect.any(Object),
      cancelledAt: expect.any(Object),
      cancelledBy: expect.any(Object),
      cancellationReason: expect.any(Object)
    }));
    expect(await queryInterface.describeTable('CanonicalEventOutbox')).toEqual(expect.objectContaining({
      deadLetteredAt: expect.any(Object),
      replayCount: expect.any(Object),
      lastReplayedAt: expect.any(Object)
    }));
    expect((await queryInterface.showAllTables()).map(String)).toContain('IntegrationOperationAuditEvents');
    expect((await queryInterface.showIndex('IntegrationOperationAuditEvents')).map(index => index.name))
      .toEqual(expect.arrayContaining([
        'integration_operation_audit_unique_request',
        'integration_operation_audit_winery_date',
        'integration_operation_audit_target'
      ]));

    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('IntegrationOperationAuditEvents');
    expect(await queryInterface.describeTable('IntegrationSyncStates')).not.toHaveProperty('operationalStatus');
    expect(await queryInterface.describeTable('IntegrationJobs')).not.toHaveProperty('replayedFromJobId');
  });
});
