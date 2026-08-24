const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InventoryPosition extends Model {
    static associate(models) {
      InventoryPosition.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      InventoryPosition.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
      InventoryPosition.belongsTo(models.StockLocation, { foreignKey: 'stockLocationId', as: 'StockLocation' });
      InventoryPosition.belongsTo(models.ExternalResourceReference, { foreignKey: 'primarySourceReferenceId', as: 'PrimarySourceReference' });
      InventoryPosition.belongsTo(models.IntegrationConnection, { foreignKey: 'authorityConnectionId', as: 'AuthorityConnection' });
      InventoryPosition.hasMany(models.InventorySnapshot, { foreignKey: 'inventoryPositionId', as: 'Snapshots' });
    }
  }
  InventoryPosition.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    productVariantId: { type: DataTypes.INTEGER, allowNull: false },
    stockLocationId: { type: DataTypes.INTEGER, allowNull: false },
    primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    onHandQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    availableQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    reservedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    incomingQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    damagedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    heldQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    incomingExpectedAt: DataTypes.DATE,
    sourceAssertedAt: { type: DataTypes.DATE, allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    staleAt: { type: DataTypes.DATE, allowNull: false },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    authorityPolicyVersion: { type: DataTypes.STRING(120), allowNull: false },
    qualityState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize, modelName: 'InventoryPosition', tableName: 'InventoryPositions', timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'stockLocationId', 'productVariantId'], name: 'inventory_positions_unique_current' },
      { unique: true, fields: ['primarySourceReferenceId'], name: 'inventory_positions_unique_source' },
      { fields: ['wineryId', 'staleAt', 'qualityState'], name: 'inventory_positions_freshness' }
    ]
  });
  return InventoryPosition;
};
