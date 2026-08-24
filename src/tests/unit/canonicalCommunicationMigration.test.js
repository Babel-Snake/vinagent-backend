const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821700000-create-canonical-communication-lineage');

describe('canonical communication lineage migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'ExternalResourceReferences',
      'IntegrationEvents'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
    await queryInterface.createTable('Messages', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      source: { type: DataTypes.STRING, allowNull: false },
      externalId: { type: DataTypes.STRING, allowNull: true }
    });
  });

  afterEach(async () => sequelize.close());

  test('adds Message lineage and immutable delivery history idempotently and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    const columns = await queryInterface.describeTable('Messages');
    expect(columns).toEqual(expect.objectContaining({
      primarySourceReferenceId: expect.any(Object),
      canonicalDeliveryStatus: expect.any(Object),
      deliveryStatusOccurredAt: expect.any(Object),
      deliveryFailureCategory: expect.any(Object)
    }));
    expect((await queryInterface.showAllTables()).map(String)).toContain('MessageDeliveryEvents');
    expect((await queryInterface.showIndex('MessageDeliveryEvents')).map(index => index.name))
      .toContain('message_delivery_events_unique');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('MessageDeliveryEvents');
    expect(await queryInterface.describeTable('Messages')).not.toHaveProperty('primarySourceReferenceId');
  });
});
