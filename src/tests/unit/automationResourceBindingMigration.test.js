const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818400000-create-automation-resource-bindings');

describe('automation resource binding migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'Users',
      'AutomationRules',
      'AutomationRuleVersions',
      'AutomationRuns',
      'IntegrationEvents'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates a reversible, idempotent managed-work binding table', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toContain('AutomationResourceBindings');
    expect(await queryInterface.describeTable('AutomationResourceBindings')).toMatchObject({
      ruleVersionId: expect.any(Object),
      managedFields: expect.any(Object),
      lastAppliedSnapshot: expect.any(Object),
      reconciliationPolicy: expect.any(Object),
      humanOverrideAt: expect.any(Object),
      lastReconciledEventId: expect.any(Object)
    });
    expect((await queryInterface.showIndex('AutomationResourceBindings')).map(index => index.name))
      .toEqual(expect.arrayContaining([
        'automation_resource_bindings_unique_purpose',
        'automation_resource_bindings_resource_state',
        'automation_resource_bindings_item'
      ]));

    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('AutomationResourceBindings');
  });
});
