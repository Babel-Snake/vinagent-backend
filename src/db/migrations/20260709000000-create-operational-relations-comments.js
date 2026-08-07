'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'OperationalItemComments'))) {
      await queryInterface.createTable('OperationalItemComments', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        itemType: { type: Sequelize.ENUM('REQUEST', 'NOTE'), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        body: { type: Sequelize.TEXT, allowNull: false },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        parentCommentId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'OperationalItemComments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalItemComments', ['wineryId', 'itemType', 'itemId', 'createdAt'], { name: 'operational_item_comments_item_created' });
      await queryInterface.addIndex('OperationalItemComments', ['parentCommentId'], { name: 'operational_item_comments_parent' });
    }

    if (!(await hasTable(queryInterface, 'OperationalItemRelations'))) {
      await queryInterface.createTable('OperationalItemRelations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        sourceType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false },
        sourceId: { type: Sequelize.INTEGER, allowNull: false },
        targetType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false },
        targetId: { type: Sequelize.INTEGER, allowNull: false },
        relationType: {
          type: Sequelize.ENUM('CREATED_FROM', 'RELATES_TO', 'BLOCKS', 'DUPLICATES', 'GENERATED_TASK', 'FOLLOW_UP_FOR', 'COMPLETION_RECORD'),
          allowNull: false,
          defaultValue: 'RELATES_TO'
        },
        metadata: { type: Sequelize.JSON, allowNull: true },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        createdBy: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalItemRelations', ['wineryId', 'sourceType', 'sourceId', 'targetType', 'targetId', 'relationType'], {
        unique: true,
        name: 'operational_item_relations_unique'
      });
      await queryInterface.addIndex('OperationalItemRelations', ['wineryId', 'targetType', 'targetId'], { name: 'operational_item_relations_target' });
    }

    if (await hasTable(queryInterface, 'Attachments')) {
      await queryInterface.changeColumn('Attachments', 'entityType', {
        type: Sequelize.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE'),
        allowNull: false
      });
    }

    if (await hasTable(queryInterface, 'OperationalItemAuditEvents')) {
      await queryInterface.changeColumn('OperationalItemAuditEvents', 'eventType', {
        type: Sequelize.ENUM(
          'CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'CANCELLED',
          'COMMENT_ADDED', 'COMMENT_DELETED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED',
          'RELATION_ADDED', 'RELATION_DELETED', 'CONVERTED_TO_TASK'
        ),
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'OperationalItemRelations')) await queryInterface.dropTable('OperationalItemRelations');
    if (await hasTable(queryInterface, 'OperationalItemComments')) await queryInterface.dropTable('OperationalItemComments');
    if (await hasTable(queryInterface, 'Attachments')) {
      await queryInterface.changeColumn('Attachments', 'entityType', {
        type: Sequelize.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE'),
        allowNull: false
      });
    }
    if (await hasTable(queryInterface, 'OperationalItemAuditEvents')) {
      await queryInterface.changeColumn('OperationalItemAuditEvents', 'eventType', {
        type: Sequelize.ENUM('CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false
      });
    }
  }
};
