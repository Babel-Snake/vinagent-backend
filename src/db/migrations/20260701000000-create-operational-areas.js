'use strict';

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === String(tableName).toLowerCase();
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some(index => index.name === indexName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'OperationalAreas'))) {
      await queryInterface.createTable('OperationalAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        name: { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalAreas', ['wineryId', 'name'], {
        unique: true,
        name: 'operational_areas_winery_name_unique'
      });
      await queryInterface.addIndex('OperationalAreas', ['wineryId', 'isActive', 'sortOrder'], {
        name: 'operational_areas_winery_active_sort'
      });
    }

    if (!(await hasTable(queryInterface, 'UserAreaMemberships'))) {
      await queryInterface.createTable('UserAreaMemberships', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        membershipRole: {
          type: Sequelize.ENUM('MEMBER', 'MANAGER'),
          allowNull: false,
          defaultValue: 'MEMBER'
        },
        isPrimary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        areaId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UserAreaMemberships', ['userId', 'areaId'], {
        unique: true,
        name: 'user_area_memberships_user_area_unique'
      });
      await queryInterface.addIndex('UserAreaMemberships', ['wineryId', 'userId'], {
        name: 'user_area_memberships_winery_user'
      });
      await queryInterface.addIndex('UserAreaMemberships', ['wineryId', 'areaId', 'membershipRole'], {
        name: 'user_area_memberships_winery_area_role'
      });
    }

    if (!(await hasTable(queryInterface, 'TaskAreas'))) {
      await queryInterface.createTable('TaskAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        relationshipType: {
          type: Sequelize.ENUM('PRIMARY', 'LINKED'),
          allowNull: false,
          defaultValue: 'LINKED'
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        taskId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Tasks', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        areaId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('TaskAreas', ['taskId', 'areaId'], {
        unique: true,
        name: 'task_areas_task_area_unique'
      });
      await queryInterface.addIndex('TaskAreas', ['wineryId', 'areaId', 'taskId'], {
        name: 'task_areas_winery_area_task'
      });
      await queryInterface.addIndex('TaskAreas', ['taskId', 'relationshipType'], {
        name: 'task_areas_task_relationship'
      });
    }

    if (!(await hasTable(queryInterface, 'NoticeAreas'))) {
      await queryInterface.createTable('NoticeAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        noticeId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Notices', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        areaId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('NoticeAreas', ['noticeId', 'areaId'], {
        unique: true,
        name: 'notice_areas_notice_area_unique'
      });
      await queryInterface.addIndex('NoticeAreas', ['wineryId', 'areaId', 'noticeId'], {
        name: 'notice_areas_winery_area_notice'
      });
    }

    if (!(await hasColumn(queryInterface, 'Tasks', 'areaScope'))) {
      await queryInterface.addColumn('Tasks', 'areaScope', {
        type: Sequelize.ENUM('ORGANISATION', 'AREAS'),
        allowNull: false,
        defaultValue: 'ORGANISATION'
      });
      await queryInterface.addIndex('Tasks', ['wineryId', 'areaScope'], { name: 'tasks_winery_area_scope' });
    }

    if (!(await hasColumn(queryInterface, 'Notices', 'areaScope'))) {
      await queryInterface.addColumn('Notices', 'areaScope', {
        type: Sequelize.ENUM('ORGANISATION', 'AREAS'),
        allowNull: false,
        defaultValue: 'ORGANISATION'
      });
      await queryInterface.addIndex('Notices', ['wineryId', 'areaScope'], { name: 'notices_winery_area_scope' });
    }

    if (!(await hasColumn(queryInterface, 'IntegrationEvents', 'suggestedAreaId'))) {
      await queryInterface.addColumn('IntegrationEvents', 'suggestedAreaId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await hasColumn(queryInterface, 'IntegrationEvents', 'confirmedAreaId'))) {
      await queryInterface.addColumn('IntegrationEvents', 'confirmedAreaId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await hasColumn(queryInterface, 'IntegrationEvents', 'areaConfidence'))) {
      await queryInterface.addColumn('IntegrationEvents', 'areaConfidence', {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true
      });
    }
    if (!(await hasColumn(queryInterface, 'IntegrationEvents', 'areaMappingSource'))) {
      await queryInterface.addColumn('IntegrationEvents', 'areaMappingSource', {
        type: Sequelize.ENUM('RULE', 'MANUAL', 'ADAPTER', 'AI', 'DEFAULT'),
        allowNull: true
      });
    }
    if (!(await hasIndex(queryInterface, 'IntegrationEvents', 'integration_events_winery_confirmed_area_status'))) {
      await queryInterface.addIndex('IntegrationEvents', ['wineryId', 'confirmedAreaId', 'status'], {
        name: 'integration_events_winery_confirmed_area_status'
      });
    }
  },

  async down(queryInterface) {
    for (const columnName of ['areaMappingSource', 'areaConfidence', 'confirmedAreaId', 'suggestedAreaId']) {
      if (await hasColumn(queryInterface, 'IntegrationEvents', columnName)) {
        await queryInterface.removeColumn('IntegrationEvents', columnName);
      }
    }
    if (await hasColumn(queryInterface, 'Notices', 'areaScope')) {
      await queryInterface.removeColumn('Notices', 'areaScope');
    }
    if (await hasColumn(queryInterface, 'Tasks', 'areaScope')) {
      await queryInterface.removeColumn('Tasks', 'areaScope');
    }
    for (const tableName of ['NoticeAreas', 'TaskAreas', 'UserAreaMemberships', 'OperationalAreas']) {
      if (await hasTable(queryInterface, tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }
  }
};
