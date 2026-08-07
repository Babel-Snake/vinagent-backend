'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

const userReference = (Sequelize, allowNull = true) => ({
  type: Sequelize.INTEGER,
  allowNull,
  references: { model: 'Users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: allowNull ? 'SET NULL' : 'RESTRICT'
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'Projects'))) {
      await queryInterface.createTable('Projects', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING, allowNull: false },
        intendedOutcome: { type: Sequelize.TEXT, allowNull: false },
        businessContext: { type: Sequelize.TEXT, allowNull: true },
        status: {
          type: Sequelize.ENUM('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'),
          allowNull: false,
          defaultValue: 'PLANNED'
        },
        areaScope: {
          type: Sequelize.ENUM('ORGANISATION', 'AREAS'),
          allowNull: false,
          defaultValue: 'ORGANISATION'
        },
        plannedStartAt: { type: Sequelize.DATE, allowNull: true },
        targetEndAt: { type: Sequelize.DATE, allowNull: true },
        actualCompletedAt: { type: Sequelize.DATE, allowNull: true },
        riskReason: { type: Sequelize.TEXT, allowNull: true },
        riskReviewAt: { type: Sequelize.DATE, allowNull: true },
        completionReason: { type: Sequelize.TEXT, allowNull: true },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        ownerUserId: userReference(Sequelize),
        createdBy: userReference(Sequelize, false),
        updatedBy: userReference(Sequelize, false),
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('Projects', ['wineryId', 'status', 'targetEndAt'], { name: 'projects_winery_status_target' });
      await queryInterface.addIndex('Projects', ['wineryId', 'ownerUserId', 'status'], { name: 'projects_winery_owner_status' });
      await queryInterface.addIndex('Projects', ['wineryId', 'areaScope'], { name: 'projects_winery_scope' });
      await queryInterface.addIndex('Projects', ['wineryId', 'updatedAt'], { name: 'projects_winery_updated' });
    }

    if (!(await hasTable(queryInterface, 'ProjectAreas'))) {
      await queryInterface.createTable('ProjectAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        relationshipType: { type: Sequelize.ENUM('PRIMARY', 'LINKED'), allowNull: false, defaultValue: 'LINKED' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        projectId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        areaId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('ProjectAreas', ['projectId', 'areaId'], { unique: true, name: 'project_areas_project_area_unique' });
      await queryInterface.addIndex('ProjectAreas', ['wineryId', 'areaId', 'projectId'], { name: 'project_areas_winery_area_project' });
      await queryInterface.addIndex('ProjectAreas', ['projectId', 'relationshipType'], { name: 'project_areas_project_relationship' });
    }

    if (!(await hasTable(queryInterface, 'ProjectParticipants'))) {
      await queryInterface.createTable('ProjectParticipants', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        participationRole: { type: Sequelize.ENUM('PARTICIPANT', 'STAKEHOLDER'), allowNull: false, defaultValue: 'PARTICIPANT' },
        notificationsEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        projectId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        addedBy: userReference(Sequelize),
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('ProjectParticipants', ['projectId', 'userId'], { unique: true, name: 'project_participants_project_user_unique' });
      await queryInterface.addIndex('ProjectParticipants', ['wineryId', 'userId', 'projectId'], { name: 'project_participants_winery_user_project' });
    }

    if (!(await hasTable(queryInterface, 'ProjectItems'))) {
      await queryInterface.createTable('ProjectItems', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        itemType: { type: Sequelize.ENUM('TASK', 'REQUEST', 'NOTICE', 'NOTE', 'CALENDAR_EVENT'), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        isRequired: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isMilestone: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        projectId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        addedBy: userReference(Sequelize),
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('ProjectItems', ['projectId', 'itemType', 'itemId'], { unique: true, name: 'project_items_project_type_item_unique' });
      await queryInterface.addIndex('ProjectItems', ['wineryId', 'itemType', 'itemId'], { name: 'project_items_winery_type_item' });
      await queryInterface.addIndex('ProjectItems', ['projectId', 'sortOrder', 'id'], { name: 'project_items_project_sort' });
    }

    if (!(await hasTable(queryInterface, 'ProjectTaskDependencies'))) {
      await queryInterface.createTable('ProjectTaskDependencies', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        projectId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        blockingTaskId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        blockedTaskId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        createdBy: userReference(Sequelize),
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('ProjectTaskDependencies', ['projectId', 'blockingTaskId', 'blockedTaskId'], { unique: true, name: 'project_dependencies_unique' });
      await queryInterface.addIndex('ProjectTaskDependencies', ['projectId', 'blockedTaskId'], { name: 'project_dependencies_blocked' });
      await queryInterface.addIndex('ProjectTaskDependencies', ['projectId', 'blockingTaskId'], { name: 'project_dependencies_blocking' });
    }

    if (!(await hasTable(queryInterface, 'ProjectAuditEvents'))) {
      await queryInterface.createTable('ProjectAuditEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        eventType: {
          type: Sequelize.ENUM(
            'CREATED', 'UPDATED', 'STATUS_CHANGED', 'OWNER_CHANGED', 'DATES_CHANGED',
            'RISK_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_UPDATED', 'PARTICIPANT_REMOVED', 'AREA_CHANGED',
            'ITEM_LINKED', 'ITEM_UPDATED', 'ITEM_UNLINKED', 'DEPENDENCY_ADDED',
            'DEPENDENCY_REMOVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED',
            'COMPLETED', 'COMPLETION_OVERRIDDEN', 'REOPENED', 'CANCELLED'
          ),
          allowNull: false
        },
        beforeSnapshot: { type: Sequelize.JSON, allowNull: true },
        afterSnapshot: { type: Sequelize.JSON, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        projectId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        actorUserId: userReference(Sequelize),
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('ProjectAuditEvents', ['wineryId', 'projectId', 'createdAt'], { name: 'project_audit_project_created' });
      await queryInterface.addIndex('ProjectAuditEvents', ['wineryId', 'actorUserId', 'createdAt'], { name: 'project_audit_actor_created' });
    }

    if (await hasTable(queryInterface, 'Attachments')) {
      await queryInterface.changeColumn('Attachments', 'entityType', {
        type: Sequelize.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE', 'PROJECT'),
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'Attachments')) {
      // PROJECT is removed from the enum below, so its polymorphic rows must not
      // survive a rollback with a value the previous schema cannot represent.
      await queryInterface.bulkDelete('Attachments', { entityType: 'PROJECT' });
      await queryInterface.changeColumn('Attachments', 'entityType', {
        type: Sequelize.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE'),
        allowNull: false
      });
    }
    for (const tableName of [
      'ProjectAuditEvents',
      'ProjectTaskDependencies',
      'ProjectItems',
      'ProjectParticipants',
      'ProjectAreas',
      'Projects'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
