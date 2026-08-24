const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821410000-create-inventory-demand-mappings');

describe('inventory demand mapping migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of ['Wineries', 'IntegrationConnections', 'ProductVariants', 'StockLocations', 'Users']) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates the auditable source-code mapping table idempotently', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toContain('InventoryDemandMappings');
    expect((await queryInterface.showIndex('InventoryDemandMappings')).map(index => index.name))
      .toEqual(expect.arrayContaining([
        'inventory_demand_mappings_unique_key',
        'inventory_demand_mappings_source_lookup',
        'inventory_demand_mappings_target_lookup'
      ]));
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('InventoryDemandMappings');
  });
});
