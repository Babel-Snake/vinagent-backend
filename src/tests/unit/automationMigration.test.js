const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260817000000-create-automation-engine');

describe('automation engine migration', () => {
  let sequelize;
  let queryInterface;

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
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
  });

  afterEach(async () => {
    await sequelize.close();
  });

  test('creates and reverses versioned rule and idempotent run tables', async () => {
    await migration.up(queryInterface, DataTypes);
    const tables = (await queryInterface.showAllTables()).map(String);
    expect(tables).toEqual(expect.arrayContaining([
      'AutomationRules',
      'AutomationRuleVersions',
      'AutomationRuns',
      'AutomationRunSteps'
    ]));

    expect((await queryInterface.showIndex('AutomationRuns')).map(index => index.name))
      .toContain('automation_runs_source_unique');
    expect((await queryInterface.showIndex('AutomationRuleVersions')).map(index => index.name))
      .toContain('automation_rule_versions_unique');

    await migration.down(queryInterface);
    const remaining = (await queryInterface.showAllTables()).map(String);
    expect(remaining).not.toEqual(expect.arrayContaining([
      'AutomationRules',
      'AutomationRuleVersions',
      'AutomationRuns',
      'AutomationRunSteps'
    ]));
  });
});
