const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821300000-create-customer-rollups');

describe('customer rollup migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of ['Wineries', 'Users', 'Members', 'IntegrationConnections']) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates current relationship, currency, run, and contribution storage idempotently', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'CustomerRollupRuns',
      'CustomerRelationshipRollups',
      'CustomerMonetaryRollups',
      'CustomerRollupContributions'
    ]));
    expect((await queryInterface.showIndex('CustomerMonetaryRollups')).map(index => index.name))
      .toContain('customer_monetary_rollups_unique_currency');
    expect((await queryInterface.showIndex('CustomerRollupContributions')).map(index => index.name))
      .toContain('customer_rollup_contributions_unique');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('CustomerRollupRuns');
  });
});
