const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InventorySnapshot extends Model {
    static associate(models) {
      InventorySnapshot.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      InventorySnapshot.belongsTo(models.InventoryPosition, { foreignKey: 'inventoryPositionId', as: 'InventoryPosition' });
      InventorySnapshot.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
      InventorySnapshot.belongsTo(models.StockLocation, { foreignKey: 'stockLocationId', as: 'StockLocation' });
      InventorySnapshot.belongsTo(models.ExternalResourceReference, { foreignKey: 'sourceReferenceId', as: 'SourceReference' });
      InventorySnapshot.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      InventorySnapshot.belongsTo(models.IntegrationConnection, { foreignKey: 'authorityConnectionId', as: 'AuthorityConnection' });
    }
  }
  InventorySnapshot.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    inventoryPositionId: { type: DataTypes.INTEGER, allowNull: false },
    productVariantId: { type: DataTypes.INTEGER, allowNull: false },
    stockLocationId: { type: DataTypes.INTEGER, allowNull: false },
    sourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    sourceEventId: DataTypes.INTEGER,
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    snapshotKey: { type: DataTypes.STRING(180), allowNull: false },
    onHandQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    availableQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    reservedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    incomingQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    damagedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    heldQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    incomingExpectedAt: DataTypes.DATE,
    sourceAssertedAt: { type: DataTypes.DATE, allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    staleAt: { type: DataTypes.DATE, allowNull: false },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    authorityPolicyVersion: { type: DataTypes.STRING(120), allowNull: false },
    qualityState: { type: DataTypes.STRING(40), allowNull: false }
  }, {
    sequelize, modelName: 'InventorySnapshot', tableName: 'InventorySnapshots', timestamps: true, updatedAt: false,
    indexes: [
      { unique: true, fields: ['inventoryPositionId', 'snapshotKey'], name: 'inventory_snapshots_unique_observation' },
      { fields: ['wineryId', 'productVariantId', 'stockLocationId', 'observedAt'], name: 'inventory_snapshots_history' }
    ]
  });
  return InventorySnapshot;
};
