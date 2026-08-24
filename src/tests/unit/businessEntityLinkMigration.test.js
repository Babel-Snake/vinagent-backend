const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260821200000-create-business-entity-links');

describe('business entity link migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    for (const tableName of [
      'Wineries', 'Users', 'IntegrationConnections', 'IntegrationEvents', 'ExternalResourceReferences'
    ]) {
      await queryInterface.createTable(tableName, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
      });
    }
  });

  afterEach(async () => sequelize.close());

  test('creates reviewable links and append-only evidence idempotently and reverses them', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect((await queryInterface.showAllTables()).map(String)).toEqual(expect.arrayContaining([
      'BusinessEntityLinks',
      'BusinessEntityLinkEvidence'
    ]));
    expect((await queryInterface.showIndex('BusinessEntityLinks')).map(index => index.name))
      .toContain('business_entity_links_unique_key');
    expect((await queryInterface.showIndex('BusinessEntityLinkEvidence')).map(index => index.name))
      .toContain('business_entity_link_evidence_unique');
    await migration.down(queryInterface);
    expect((await queryInterface.showAllTables()).map(String)).not.toContain('BusinessEntityLinks');
  });
});
