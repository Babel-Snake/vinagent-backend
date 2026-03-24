'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('WineryContacts', 'reportsToId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'WineryContacts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('WineryContacts', 'responsibilities', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('WineryContacts', 'reportsToId');
    await queryInterface.removeColumn('WineryContacts', 'responsibilities');
  }
};
