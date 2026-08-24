const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821600000-create-canonical-workforce');

describe('canonical workforce migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries',
      'Users',
      'WineryContacts',
      'ExternalResourceReferences',
      'WineryLocations',
      'OperationalAreas',
      'IntegrationConnections'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates the workforce graph idempotently and reverses it', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'StaffIdentities',
      'RoleSkillDefinitions',
      'StaffRoleSkills',
      'RosterShifts',
      'RosterShiftSkills',
      'StaffAvailabilityEvents',
      'WorkforceCoverageObservations',
      'WorkforceDemandMappings'
    ]));
    expect((await queryInterface.showIndex('StaffIdentities')).map(index => index.name))
      .toContain('staff_identities_unique_user');
    expect((await queryInterface.showIndex('RosterShifts')).map(index => index.name))
      .toContain('roster_shifts_coverage');
    expect((await queryInterface.showIndex('WorkforceDemandMappings')).map(index => index.name))
      .toContain('workforce_demand_mappings_unique_key');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('StaffIdentities');
  });
});
