'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('WinerySettings', 'identityMatchingConfig', {
      type: Sequelize.JSON,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('WinerySettings', 'identityMatchingConfig');
  }
};
