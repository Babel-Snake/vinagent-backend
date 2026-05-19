'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('CalendarEvents', 'type', {
      type: Sequelize.ENUM('reminder', 'meeting', 'event', 'task_deadline', 'notice', 'other'),
      allowNull: true,
      defaultValue: 'other'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('CalendarEvents', 'type', {
      type: Sequelize.ENUM('reminder', 'meeting', 'task_deadline', 'notice', 'other'),
      allowNull: true,
      defaultValue: 'other'
    });
  }
};
