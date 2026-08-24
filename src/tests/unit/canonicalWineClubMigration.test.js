const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821000000-create-canonical-wine-club');

describe('canonical Wine Club migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries', 'Users', 'Members', 'ExternalResourceReferences', 'IntegrationConnections', 'IntegrationEvents'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates the provider-neutral Wine Club graph idempotently and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'WineClubPrograms',
      'WineClubMemberships',
      'WineClubMembershipEvents',
      'WineClubAllocations',
      'WineClubAllocationItems'
    ]));
    expect((await queryInterface.showIndex('WineClubMemberships')).map(index => index.name))
      .toContain('wine_club_memberships_unique_member');
    expect((await queryInterface.showIndex('WineClubAllocationItems')).map(index => index.name))
      .toContain('wine_club_allocation_items_unique_line');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('WineClubPrograms');
  });
});
