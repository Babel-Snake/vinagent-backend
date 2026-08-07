'use strict';

const TASK_ACTION_VALUES_WITH_ATTACHMENTS = [
  'CREATED',
  'ACTIONED',
  'REJECTED',
  'EXECUTION_TRIGGERED',
  'EXECUTION_RECORDED',
  'UPDATED_PAYLOAD',
  'NOTE_ADDED',
  'MANUAL_CREATED',
  'MANUAL_UPDATE',
  'OUTCOME_RECORDED',
  'MEMBER_ENRICHED',
  'ASSIGNED',
  'LINKED_TASK',
  'STEP_CREATED',
  'STEP_UPDATED',
  'STEP_COMPLETED',
  'STEP_DELETED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_DELETED'
];

const TASK_ACTION_VALUES_PREVIOUS = [
  'CREATED',
  'ACTIONED',
  'REJECTED',
  'EXECUTION_TRIGGERED',
  'EXECUTION_RECORDED',
  'UPDATED_PAYLOAD',
  'NOTE_ADDED',
  'MANUAL_CREATED',
  'MANUAL_UPDATE',
  'OUTCOME_RECORDED',
  'MEMBER_ENRICHED',
  'ASSIGNED',
  'LINKED_TASK',
  'STEP_CREATED',
  'STEP_UPDATED',
  'STEP_COMPLETED',
  'STEP_DELETED'
];

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

async function changeTaskActionEnum(queryInterface, Sequelize, values) {
  await queryInterface.sequelize.query('ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;');
  await queryInterface.changeColumn('TaskActions', 'actionType', {
    type: Sequelize.ENUM(...values),
    allowNull: false
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'Attachments'))) {
      await queryInterface.createTable('Attachments', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        entityType: {
          type: Sequelize.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE'),
          allowNull: false
        },
        entityId: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        filename: {
          type: Sequelize.STRING,
          allowNull: false
        },
        originalFilename: {
          type: Sequelize.STRING,
          allowNull: false
        },
        mimeType: {
          type: Sequelize.STRING,
          allowNull: false
        },
        sizeBytes: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        storageKey: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true
        },
        uploadedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        deletedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        deletedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE
        }
      });
    }

    if (!(await hasIndex(queryInterface, 'Attachments', 'attachments_winery_entity_active'))) {
      await queryInterface.addIndex('Attachments', ['wineryId', 'entityType', 'entityId', 'deletedAt'], {
        name: 'attachments_winery_entity_active'
      });
    }
    if (!(await hasIndex(queryInterface, 'Attachments', 'attachments_winery_uploader'))) {
      await queryInterface.addIndex('Attachments', ['wineryId', 'uploadedBy'], {
        name: 'attachments_winery_uploader'
      });
    }

    await changeTaskActionEnum(queryInterface, Sequelize, TASK_ACTION_VALUES_WITH_ATTACHMENTS);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE TaskActions
      SET actionType = 'NOTE_ADDED'
      WHERE actionType IN ('ATTACHMENT_ADDED', 'ATTACHMENT_DELETED')
    `);
    await changeTaskActionEnum(queryInterface, Sequelize, TASK_ACTION_VALUES_PREVIOUS);

    if (await hasTable(queryInterface, 'Attachments')) {
      await queryInterface.dropTable('Attachments');
    }
  }
};
