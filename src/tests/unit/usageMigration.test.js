const { Sequelize, DataTypes } = require('sequelize');
const migration = require('../../db/migrations/20260808000000-create-usage-metering');

describe('usage metering migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('Wineries', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false }
    });
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: true }
    });
    await queryInterface.bulkInsert('Wineries', [{ id: 7, name: 'Migration Winery' }]);
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('creates the complete usage schema and backfills a pilot billing profile', async () => {
    await migration.up(queryInterface, DataTypes);
    const tables = (await queryInterface.showAllTables()).map(String);
    for (const table of [
      'WineryBillingProfiles', 'UsageEvents', 'UsageCounterBuckets',
      'UsageGaugeSnapshots', 'UserActivityDaily', 'UsageExportDeliveries'
    ]) {
      expect(tables).toContain(table);
    }
    const profiles = await sequelize.query('SELECT * FROM WineryBillingProfiles', {
      type: Sequelize.QueryTypes.SELECT
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ wineryId: 7, lifecycleStatus: 'PILOT', planCode: 'pilot', billingProvider: 'none' });

    await migration.down(queryInterface);
    const remaining = (await queryInterface.showAllTables()).map(String);
    expect(remaining).not.toContain('UsageEvents');
    expect(remaining).not.toContain('WineryBillingProfiles');
  });
});
