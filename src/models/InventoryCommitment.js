const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InventoryCommitment extends Model {
    static associate(models) {
      InventoryCommitment.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      InventoryCommitment.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
      InventoryCommitment.belongsTo(models.StockLocation, { foreignKey: 'stockLocationId', as: 'StockLocation' });
      InventoryCommitment.belongsTo(models.ExternalResourceReference, { foreignKey: 'sourceReferenceId', as: 'SourceReference' });
      InventoryCommitment.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }
  InventoryCommitment.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    productVariantId: { type: DataTypes.INTEGER, allowNull: false },
    stockLocationId: { type: DataTypes.INTEGER, allowNull: false },
    sourceType: { type: DataTypes.STRING(40), allowNull: false },
    sourceId: { type: DataTypes.INTEGER, allowNull: false },
    purposeKey: { type: DataTypes.STRING(180), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    requiredAt: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'EXPECTED' },
    confidence: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 1 },
    derivation: { type: DataTypes.STRING(40), allowNull: false },
    derivationVersion: { type: DataTypes.STRING(120), allowNull: false },
    sourceReferenceId: DataTypes.INTEGER,
    sourceEventId: DataTypes.INTEGER,
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    releasedAt: DataTypes.DATE,
    metadata: DataTypes.JSON
  }, {
    sequelize, modelName: 'InventoryCommitment', tableName: 'InventoryCommitments', timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'sourceType', 'sourceId', 'productVariantId', 'stockLocationId', 'purposeKey'],
        name: 'inventory_commitments_unique_demand'
      },
      {
        fields: ['wineryId', 'productVariantId', 'stockLocationId', 'status', 'requiredAt'],
        name: 'inventory_commitments_atp'
      },
      { fields: ['wineryId', 'sourceType', 'sourceId'], name: 'inventory_commitments_source' }
    ]
  });
  return InventoryCommitment;
};
