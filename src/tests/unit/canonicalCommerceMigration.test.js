const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821100000-create-canonical-commerce');

describe('canonical commerce migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'Members',
      'WineryLocations',
      'ExternalResourceReferences',
      'IntegrationConnections',
      'WineryProducts',
      'IntegrationEvents'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates the provider-neutral commerce graph idempotently and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'SalesOrders',
      'SalesOrderLines',
      'PaymentSummaryEvents',
      'RefundSummaries'
    ]));
    expect((await queryInterface.showIndex('SalesOrders')).map(index => index.name))
      .toContain('sales_orders_unique_connection_number');
    expect((await queryInterface.showIndex('PaymentSummaryEvents')).map(index => index.name))
      .toContain('payment_summary_events_unique');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('SalesOrders');
  });
});
