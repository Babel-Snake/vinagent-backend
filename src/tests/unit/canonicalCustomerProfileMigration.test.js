const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260820900000-create-canonical-customer-profile');

describe('canonical customer profile migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of ['Wineries', 'Members', 'Users', 'ExternalResourceReferences']) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates resumable customer contact, address, consent, and milestone tables', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    const tables = (await queryInterface.showAllTables()).map(String);
    expect(tables).toEqual(expect.arrayContaining([
      'CustomerContactPoints',
      'CustomerAddresses',
      'CustomerConsents',
      'CustomerLifecycleMilestones'
    ]));
    expect((await queryInterface.showIndex('CustomerContactPoints')).map(index => index.name))
      .toContain('customer_contact_points_identity_lookup');
    expect((await queryInterface.showIndex('CustomerConsents')).map(index => index.name))
      .toContain('customer_consents_timeline');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String))
      .not.toEqual(expect.arrayContaining(['CustomerContactPoints', 'CustomerAddresses']));
  });
});
