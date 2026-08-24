const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260820700000-add-projection-issue-review-lifecycle');

describe('projection issue review lifecycle migration', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('ProjectionIssues', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false }
    });
  });

  afterEach(async () => sequelize.close());

  test('adds idempotent acknowledgement and typed resolution metadata', async () => {
    await migration.up(queryInterface, DataTypes);
    await expect(migration.up(queryInterface, DataTypes)).resolves.toBeUndefined();
    expect(await queryInterface.describeTable('ProjectionIssues')).toEqual(expect.objectContaining({
      acknowledgedAt: expect.any(Object),
      acknowledgedBy: expect.any(Object),
      resolutionMethod: expect.any(Object)
    }));
    expect((await queryInterface.showIndex('ProjectionIssues')).map(index => index.name))
      .toContain('projection_issues_acknowledgement');
    await migration.down(queryInterface);
    expect(await queryInterface.describeTable('ProjectionIssues')).not.toHaveProperty('acknowledgedAt');
  });
});
