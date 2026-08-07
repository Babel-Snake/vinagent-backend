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
    if (await hasTable(queryInterface, 'OperationalAreaIntegrationConfigs')) return;

    await queryInterface.createTable('OperationalAreaIntegrationConfigs', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
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
      providerConnections: { type: Sequelize.JSON, allowNull: false },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addIndex('OperationalAreaIntegrationConfigs', ['areaId'], {
      unique: true,
      name: 'area_integration_configs_area_unique'
    });
    await queryInterface.addIndex('OperationalAreaIntegrationConfigs', ['wineryId', 'areaId'], {
      name: 'area_integration_configs_winery_area'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'OperationalAreaIntegrationConfigs')) {
      await queryInterface.dropTable('OperationalAreaIntegrationConfigs');
    }
  }
};
