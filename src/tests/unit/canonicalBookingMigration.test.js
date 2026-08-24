const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260818300000-create-canonical-bookings');

describe('canonical booking migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const [tableName, extra = {}] of [
      ['Wineries'],
      ['Users', { wineryId: DataTypes.INTEGER }],
      ['IntegrationConnections', { wineryId: DataTypes.INTEGER }],
      ['WineryLocations', { wineryId: DataTypes.INTEGER }],
      ['DataAuthorityPolicies', { wineryId: DataTypes.INTEGER }],
      ['Members', { wineryId: DataTypes.INTEGER }],
      ['WineryBookingTypes', { wineryId: DataTypes.INTEGER }],
      ['ExternalResourceReferences', { wineryId: DataTypes.INTEGER }],
      ['IntegrationEvents', { wineryId: DataTypes.INTEGER }],
      ['OperationalAreas', { wineryId: DataTypes.INTEGER }]
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        ...Object.fromEntries(Object.entries(extra).map(([key, type]) => [key, { type }]))
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates reversible typed booking projection and activation tables', async () => {
    await migration.up(queryInterface, DataTypes);
    const tables = (await queryInterface.showAllTables()).map(String);
    expect(tables).toEqual(expect.arrayContaining([
      'IntegrationDomainActivations',
      'Bookings',
      'BookingAreaLinks',
      'BookingItems',
      'BookingRequirements',
      'BookingStatusEvents'
    ]));
    expect(await queryInterface.describeTable('Bookings')).toMatchObject({
      primarySourceReferenceId: expect.any(Object),
      authorityPolicyId: expect.any(Object),
      canonicalStatus: expect.any(Object),
      projectionRevision: expect.any(Object),
      sourceUpdatedAt: expect.any(Object)
    });
    expect(await queryInterface.describeTable('IntegrationDomainActivations')).toMatchObject({
      sourceWatermarkAt: expect.any(Object),
      previewHash: expect.any(Object),
      authorityPolicyId: expect.any(Object)
    });
    expect((await queryInterface.showIndex('BookingRequirements')).map(index => index.name))
      .toContain('booking_requirements_unique_key');

    await migration.down(queryInterface);
    const remaining = (await queryInterface.showAllTables()).map(String);
    expect(remaining).not.toContain('Bookings');
    expect(remaining).not.toContain('IntegrationDomainActivations');
  });

  test('can safely resume after a complete run', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
  });
});
