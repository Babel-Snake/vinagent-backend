'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  return (await queryInterface.showIndex(tableName)).some(index => index.name === indexName);
}

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await hasIndex(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

const reference = (Sequelize, model, allowNull = false, onDelete = 'CASCADE') => ({
  type: Sequelize.INTEGER,
  allowNull,
  references: { model, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'InventoryDemandMappings'))) {
      await queryInterface.createTable('InventoryDemandMappings', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        sourceRecordType: { type: Sequelize.STRING(40), allowNull: false },
        sourceConnectionId: reference(Sequelize, 'IntegrationConnections', true, 'CASCADE'),
        sourceCode: { type: Sequelize.STRING(160), allowNull: false },
        sourceCodeNormalized: { type: Sequelize.STRING(160), allowNull: false },
        mappingKey: { type: Sequelize.STRING(64), allowNull: false },
        productVariantId: reference(Sequelize, 'ProductVariants', false, 'RESTRICT'),
        stockLocationId: reference(Sequelize, 'StockLocations', false, 'RESTRICT'),
        quantityMultiplier: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        confirmationStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CONFIRMED' },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'InventoryDemandMappings', ['wineryId', 'mappingKey'], {
      unique: true,
      name: 'inventory_demand_mappings_unique_key'
    });
    await ensureIndex(queryInterface, 'InventoryDemandMappings', [
      'wineryId', 'sourceRecordType', 'sourceCodeNormalized', 'status'
    ], {
      name: 'inventory_demand_mappings_source_lookup'
    });
    await ensureIndex(queryInterface, 'InventoryDemandMappings', [
      'wineryId', 'productVariantId', 'stockLocationId', 'status'
    ], {
      name: 'inventory_demand_mappings_target_lookup'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'InventoryDemandMappings')) {
      await queryInterface.dropTable('InventoryDemandMappings');
    }
  }
};
