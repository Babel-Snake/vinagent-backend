'use strict';

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return name === tableName;
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

async function createLinkTable(queryInterface, Sequelize, tableName, targetColumn, targetTable) {
  if (await hasTable(queryInterface, tableName)) return;

  await queryInterface.createTable(tableName, {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    },
    calendarEventId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'CalendarEvents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    [targetColumn]: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: targetTable, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    wineryId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    createdBy: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    createdAt: {
      allowNull: false,
      type: Sequelize.DATE
    }
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await createLinkTable(queryInterface, Sequelize, 'CalendarEventTasks', 'taskId', 'Tasks');
    await createLinkTable(queryInterface, Sequelize, 'CalendarEventNotices', 'noticeId', 'Notices');

    if (!(await hasIndex(queryInterface, 'CalendarEventTasks', 'calendar_event_tasks_event_task_unique'))) {
      await queryInterface.addIndex('CalendarEventTasks', ['calendarEventId', 'taskId'], {
        unique: true,
        name: 'calendar_event_tasks_event_task_unique'
      });
    }
    if (!(await hasIndex(queryInterface, 'CalendarEventTasks', 'calendar_event_tasks_winery_event'))) {
      await queryInterface.addIndex('CalendarEventTasks', ['wineryId', 'calendarEventId'], {
        name: 'calendar_event_tasks_winery_event'
      });
    }
    if (!(await hasIndex(queryInterface, 'CalendarEventTasks', 'calendar_event_tasks_winery_task'))) {
      await queryInterface.addIndex('CalendarEventTasks', ['wineryId', 'taskId'], {
        name: 'calendar_event_tasks_winery_task'
      });
    }

    if (!(await hasIndex(queryInterface, 'CalendarEventNotices', 'calendar_event_notices_event_notice_unique'))) {
      await queryInterface.addIndex('CalendarEventNotices', ['calendarEventId', 'noticeId'], {
        unique: true,
        name: 'calendar_event_notices_event_notice_unique'
      });
    }
    if (!(await hasIndex(queryInterface, 'CalendarEventNotices', 'calendar_event_notices_winery_event'))) {
      await queryInterface.addIndex('CalendarEventNotices', ['wineryId', 'calendarEventId'], {
        name: 'calendar_event_notices_winery_event'
      });
    }
    if (!(await hasIndex(queryInterface, 'CalendarEventNotices', 'calendar_event_notices_winery_notice'))) {
      await queryInterface.addIndex('CalendarEventNotices', ['wineryId', 'noticeId'], {
        name: 'calendar_event_notices_winery_notice'
      });
    }

    await queryInterface.sequelize.query(`
      INSERT IGNORE INTO CalendarEventTasks (calendarEventId, taskId, wineryId, createdBy, createdAt)
      SELECT id, taskId, wineryId, createdBy, COALESCE(createdAt, NOW())
      FROM CalendarEvents
      WHERE taskId IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      INSERT IGNORE INTO CalendarEventNotices (calendarEventId, noticeId, wineryId, createdBy, createdAt)
      SELECT id, noticeId, wineryId, createdBy, COALESCE(createdAt, NOW())
      FROM CalendarEvents
      WHERE noticeId IS NOT NULL
    `);
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'CalendarEventNotices')) {
      await queryInterface.dropTable('CalendarEventNotices');
    }
    if (await hasTable(queryInterface, 'CalendarEventTasks')) {
      await queryInterface.dropTable('CalendarEventTasks');
    }
  }
};
