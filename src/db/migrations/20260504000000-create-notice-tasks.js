'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('NoticeTasks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      noticeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Notices', key: 'id' },
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

    await queryInterface.addIndex('NoticeTasks', ['noticeId', 'taskId'], {
      unique: true,
      name: 'notice_tasks_notice_task_unique'
    });
    await queryInterface.addIndex('NoticeTasks', ['wineryId', 'noticeId']);
    await queryInterface.addIndex('NoticeTasks', ['wineryId', 'taskId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('NoticeTasks');
  }
};
