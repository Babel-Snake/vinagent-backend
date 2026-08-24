const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821500000-create-canonical-fulfilment');

describe('canonical fulfilment migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'Members',
      'SalesOrders',
      'WineClubAllocations',
      'CustomerAddresses',
      'ExternalResourceReferences',
      'IntegrationConnections',
      'SalesOrderLines',
      'ProductVariants',
      'IntegrationEvents'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates the shipment graph idempotently and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'Shipments',
      'ShipmentPackages',
      'ShipmentItems',
      'ShipmentTrackingEvents'
    ]));
    expect((await queryInterface.showIndex('Shipments')).map(index => index.name))
      .toContain('shipments_unique_tracking_reference');
    expect((await queryInterface.showIndex('ShipmentTrackingEvents')).map(index => index.name))
      .toContain('shipment_tracking_events_unique');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('Shipments');
  });
});
