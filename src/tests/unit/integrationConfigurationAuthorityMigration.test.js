const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260820800000-create-integration-configuration-authorities');

describe('integration configuration authority migration', () => {
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
  });

  afterEach(async () => sequelize.close());

  test('creates idempotent per-winery domain authority state and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect(await queryInterface.describeTable('IntegrationConfigurationAuthorities'))
      .toEqual(expect.objectContaining({
        domain: expect.any(Object),
        status: expect.any(Object),
        legacySnapshot: expect.any(Object),
        canonicalSnapshot: expect.any(Object),
        lockVersion: expect.any(Object)
      }));
    expect((await queryInterface.showIndex('IntegrationConfigurationAuthorities')).map(index => index.name))
      .toEqual(expect.arrayContaining([
        'integration_configuration_authorities_unique',
        'integration_configuration_authorities_status'
      ]));
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String))
      .not.toContain('IntegrationConfigurationAuthorities');
  });
});
