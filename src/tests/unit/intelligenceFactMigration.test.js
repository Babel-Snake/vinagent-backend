const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821800000-create-intelligence-facts');

describe('intelligence fact migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'OperationalAreas',
      'IntegrationConnections',
      'IntegrationEvents',
      'ExternalResourceReferences',
      'Users'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates versioned facts and materialization runs idempotently and reverses them', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'IntelligenceFacts',
      'IntelligenceFactMaterializationRuns'
    ]));
    expect((await queryInterface.showIndex('IntelligenceFacts')).map(index => index.name))
      .toContain('intelligence_facts_unique_version');
    expect((await queryInterface.showIndex('IntelligenceFactMaterializationRuns')).map(index => index.name))
      .toContain('intelligence_fact_runs_unique_request');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('IntelligenceFacts');
  });
});
