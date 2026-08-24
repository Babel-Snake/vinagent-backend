const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818500000-create-integration-sync-scheduler');

describe('integration sync scheduler migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('IntegrationConnections', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
  });

  afterEach(async () => sequelize.close());

  test('creates a provider-neutral durable permit table and can safely resume and reverse', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String))
      .toContain('IntegrationProviderScheduleStates');
    expect(await queryInterface.describeTable('IntegrationProviderScheduleStates'))
      .toEqual(expect.objectContaining({
        nextPermitAt: expect.any(Object),
        rateWindowStartedAt: expect.any(Object),
        rateWindowScheduledCount: expect.any(Object)
      }));
    expect((await queryInterface.showIndex('IntegrationProviderScheduleStates')).map(index => index.name))
      .toEqual(expect.arrayContaining([
        'integration_provider_schedule_states_unique',
        'integration_provider_schedule_states_due'
      ]));
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String))
      .not.toContain('IntegrationProviderScheduleStates');
  });
});
