'use strict';

async function describeTable(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return null;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const tableName of ['WineryFAQItems', 'WinerySops']) {
      const table = await describeTable(queryInterface, tableName);
      if (!table || table.areaId) continue;

      await queryInterface.addColumn(tableName, 'areaId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      await queryInterface.addIndex(tableName, ['wineryId', 'areaId', 'isActive'], {
        name: `${tableName.toLowerCase()}_winery_area_active`
      });
    }
  },

  async down(queryInterface) {
    for (const tableName of ['WinerySops', 'WineryFAQItems']) {
      const table = await describeTable(queryInterface, tableName);
      if (!table?.areaId) continue;
      await queryInterface.removeColumn(tableName, 'areaId');
    }
  }
};
