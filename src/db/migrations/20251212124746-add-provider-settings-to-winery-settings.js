'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('WinerySettings', 'bookingProvider', {
      type: Sequelize.ENUM('mock', 'tock', 'sevenrooms'),
      defaultValue: 'mock'
    });
    await queryInterface.addColumn('WinerySettings', 'bookingConfig', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addColumn('WinerySettings', 'crmProvider', {
      type: Sequelize.ENUM('mock', 'commerce7', 'winedirect'),
      defaultValue: 'mock'
    });
    await queryInterface.addColumn('WinerySettings', 'crmConfig', {
      type: Sequelize.JSON,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('WinerySettings', 'bookingProvider');
    await queryInterface.removeColumn('WinerySettings', 'bookingConfig');
    await queryInterface.removeColumn('WinerySettings', 'crmProvider');
    await queryInterface.removeColumn('WinerySettings', 'crmConfig');
  }
};
