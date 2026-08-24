const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821400000-create-canonical-inventory');

describe('canonical inventory migration', () => {
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
    await queryInterface.createTable('WineryProducts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false }
    });
    await queryInterface.createTable('WineryLocations', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false }
    });
    for (const tableName of ['ExternalResourceReferences', 'IntegrationConnections', 'IntegrationEvents']) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates and backfills the provider-neutral inventory graph idempotently', async () => {
    await queryInterface.bulkInsert('Wineries', [{ id: 1 }]);
    await queryInterface.bulkInsert('WineryProducts', [{ id: 7, wineryId: 1, name: 'Truffle Pairing' }]);
    await queryInterface.bulkInsert('WineryLocations', [{ id: 9, wineryId: 1, name: 'Cellar Door' }]);

    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'ProductVariants',
      'StockLocations',
      'InventoryPositions',
      'InventorySnapshots',
      'InventoryCommitments'
    ]));
    const variants = await sequelize.query('SELECT * FROM ProductVariants', { type: Sequelize.QueryTypes.SELECT });
    const locations = await sequelize.query('SELECT * FROM StockLocations', { type: Sequelize.QueryTypes.SELECT });
    expect(variants).toHaveLength(1);
    expect(variants[0]).toEqual(expect.objectContaining({
      wineryProductId: 7,
      code: 'legacy-product-7',
      provenance: 'LEGACY_BACKFILL'
    }));
    expect(locations).toHaveLength(1);
    expect(locations[0]).toEqual(expect.objectContaining({
      wineryLocationId: 9,
      code: 'legacy-location-9',
      provenance: 'LEGACY_BACKFILL'
    }));
    expect((await queryInterface.showIndex('InventoryPositions')).map(index => index.name))
      .toContain('inventory_positions_unique_current');
    expect((await queryInterface.showIndex('InventoryCommitments')).map(index => index.name))
      .toContain('inventory_commitments_unique_demand');

    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('ProductVariants');
  });
});
