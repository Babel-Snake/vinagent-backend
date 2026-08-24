const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InventoryDemandMapping extends Model {
    static associate(models) {
      InventoryDemandMapping.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      InventoryDemandMapping.belongsTo(models.IntegrationConnection, { foreignKey: 'sourceConnectionId', as: 'SourceConnection' });
      InventoryDemandMapping.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
      InventoryDemandMapping.belongsTo(models.StockLocation, { foreignKey: 'stockLocationId', as: 'StockLocation' });
      InventoryDemandMapping.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      InventoryDemandMapping.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
    }
  }
  InventoryDemandMapping.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    sourceRecordType: { type: DataTypes.STRING(40), allowNull: false },
    sourceConnectionId: DataTypes.INTEGER,
    sourceCode: { type: DataTypes.STRING(160), allowNull: false },
    sourceCodeNormalized: { type: DataTypes.STRING(160), allowNull: false },
    mappingKey: { type: DataTypes.STRING(64), allowNull: false },
    productVariantId: { type: DataTypes.INTEGER, allowNull: false },
    stockLocationId: { type: DataTypes.INTEGER, allowNull: false },
    quantityMultiplier: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    confirmationStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'MANAGER_CONFIRMED' },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'InventoryDemandMapping',
    tableName: 'InventoryDemandMappings',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'mappingKey'], name: 'inventory_demand_mappings_unique_key' },
      {
        fields: ['wineryId', 'sourceRecordType', 'sourceCodeNormalized', 'status'],
        name: 'inventory_demand_mappings_source_lookup'
      },
      {
        fields: ['wineryId', 'productVariantId', 'stockLocationId', 'status'],
        name: 'inventory_demand_mappings_target_lookup'
      }
    ]
  });
  return InventoryDemandMapping;
};
