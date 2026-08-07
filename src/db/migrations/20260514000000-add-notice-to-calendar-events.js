'use strict';

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === String(tableName).toLowerCase();
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'CalendarEvents'))) {
      await queryInterface.createTable('CalendarEvents', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        start: {
          type: Sequelize.DATE,
          allowNull: false
        },
        end: {
          type: Sequelize.DATE,
          allowNull: false
        },
        allDay: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        type: {
          type: Sequelize.ENUM('reminder', 'meeting', 'event', 'task_deadline', 'notice', 'other'),
          allowNull: true,
          defaultValue: 'other'
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Wineries',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        taskId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Tasks',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        noticeId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Notices',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    if (!(await hasColumn(queryInterface, 'CalendarEvents', 'noticeId'))) {
      await queryInterface.addColumn('CalendarEvents', 'noticeId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Notices',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        after: 'taskId'
      });
    }

    if (!(await hasIndex(queryInterface, 'CalendarEvents', 'idx_calendar_events_notice_id'))) {
      await queryInterface.addIndex('CalendarEvents', ['noticeId'], {
        name: 'idx_calendar_events_notice_id'
      });
    }

    await queryInterface.changeColumn('CalendarEvents', 'type', {
      type: Sequelize.ENUM('reminder', 'meeting', 'event', 'task_deadline', 'notice', 'other'),
      allowNull: true,
      defaultValue: 'other'
    });
  },

  async down(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'CalendarEvents'))) {
      return;
    }

    await queryInterface.changeColumn('CalendarEvents', 'type', {
      type: Sequelize.ENUM('reminder', 'meeting', 'task_deadline', 'other'),
      allowNull: true,
      defaultValue: 'other'
    });

    if (await hasColumn(queryInterface, 'CalendarEvents', 'noticeId')) {
      // MySQL may use idx_calendar_events_notice_id for the noticeId foreign key.
      // Removing the column drops the constraint and its supporting index safely.
      await queryInterface.removeColumn('CalendarEvents', 'noticeId');
    }
  }
};
