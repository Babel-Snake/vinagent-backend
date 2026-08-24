const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818200000-create-integration-credentials');

describe('integration credential migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('Wineries', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('IntegrationConnections', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
  });

  afterEach(async () => {
    await sequelize.close();
  });

  test('creates a reversible encrypted credential envelope table', async () => {
    await migration.up(queryInterface, DataTypes);
    const columns = await queryInterface.describeTable('IntegrationCredentials');
    expect(columns).toMatchObject({
      credentialId: expect.any(Object),
      encryptedPayload: expect.any(Object),
      initializationVector: expect.any(Object),
      authenticationTag: expect.any(Object),
      keyId: expect.any(Object),
      lastVerificationStatus: expect.any(Object)
    });
    const indexes = (await queryInterface.showIndex('IntegrationCredentials')).map(index => index.name);
    expect(indexes).toEqual(expect.arrayContaining([
      'integration_credentials_unique_reference',
      'integration_credentials_connection_status'
    ]));

    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('IntegrationCredentials');
  });

  test('can safely resume after a complete run', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
  });
});
