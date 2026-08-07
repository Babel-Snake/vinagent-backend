const { DataTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260727000000-create-projects');
const leadMigration = require('../../db/migrations/20260727010000-add-project-lead-delegation');

describe('Projects migration', () => {
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
    await queryInterface.createTable('OperationalAreas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('Tasks', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wineryId: { type: DataTypes.INTEGER, allowNull: false }
    });
    await queryInterface.createTable('Attachments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      entityType: {
        type: DataTypes.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE'),
        allowNull: false
      }
    });
  });

  afterEach(async () => {
    await sequelize.close();
  });

  test('applies and rolls back every Project table while preserving the attachment table', async () => {
    await migration.up(queryInterface, DataTypes);

    const tablesAfterUp = (await queryInterface.showAllTables()).map(String);
    expect(tablesAfterUp).toEqual(expect.arrayContaining([
      'Projects',
      'ProjectAreas',
      'ProjectParticipants',
      'ProjectItems',
      'ProjectTaskDependencies',
      'ProjectAuditEvents'
    ]));

    await queryInterface.bulkInsert('Attachments', [{ entityType: 'PROJECT' }]);
    await migration.down(queryInterface, DataTypes);

    const tablesAfterDown = (await queryInterface.showAllTables()).map(String);
    expect(tablesAfterDown).not.toEqual(expect.arrayContaining(['Projects', 'ProjectItems']));
    expect(tablesAfterDown).toContain('Attachments');
    const remainingAttachments = await queryInterface.rawSelect('Attachments', {}, 'COUNT(*)');
    expect(Number(remainingAttachments)).toBe(0);
  });

  test('adds and safely rolls back scoped Project Lead delegation fields', async () => {
    await migration.up(queryInterface, DataTypes);
    await leadMigration.up(queryInterface, DataTypes);

    const projectColumns = await queryInterface.describeTable('Projects');
    expect(projectColumns).toEqual(expect.objectContaining({
      leadUserId: expect.any(Object),
      leadGrantedByUserId: expect.any(Object),
      leadGrantedAt: expect.any(Object)
    }));
    const itemColumns = await queryInterface.describeTable('ProjectItems');
    expect(itemColumns.linkType).toBeTruthy();
    expect((await queryInterface.showIndex('Projects')).map(index => index.name))
      .toContain('projects_winery_lead_status');

    await queryInterface.bulkInsert('Wineries', [{ id: 1 }]);
    await queryInterface.bulkInsert('Users', [{ id: 1, wineryId: 1 }, { id: 2, wineryId: 1 }]);
    await queryInterface.bulkInsert('Projects', [{
      id: 1,
      title: 'Delegation migration Project',
      intendedOutcome: 'Verify reversible schema changes.',
      status: 'ACTIVE',
      areaScope: 'ORGANISATION',
      wineryId: 1,
      ownerUserId: 1,
      leadUserId: 2,
      leadGrantedByUserId: 1,
      leadGrantedAt: new Date(),
      createdBy: 1,
      updatedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
    await queryInterface.bulkInsert('ProjectAuditEvents', [{
      eventType: 'LEAD_ASSIGNED',
      wineryId: 1,
      projectId: 1,
      actorUserId: 1,
      createdAt: new Date()
    }]);

    await leadMigration.down(queryInterface, DataTypes);

    const rolledBackProjectColumns = await queryInterface.describeTable('Projects');
    expect(rolledBackProjectColumns.leadUserId).toBeUndefined();
    expect(rolledBackProjectColumns.leadGrantedByUserId).toBeUndefined();
    expect(rolledBackProjectColumns.leadGrantedAt).toBeUndefined();
    expect((await queryInterface.describeTable('ProjectItems')).linkType).toBeUndefined();
    expect(Number(await queryInterface.rawSelect('ProjectAuditEvents', {}, 'COUNT(*)'))).toBe(0);
  });
});
