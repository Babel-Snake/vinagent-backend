const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductVariant extends Model {
    static associate(models) {
      ProductVariant.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProductVariant.belongsTo(models.WineryProduct, { foreignKey: 'wineryProductId', as: 'WineryProduct' });
      ProductVariant.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      ProductVariant.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      ProductVariant.hasMany(models.InventoryPosition, { foreignKey: 'productVariantId', as: 'InventoryPositions' });
      ProductVariant.hasMany(models.InventorySnapshot, { foreignKey: 'productVariantId', as: 'InventorySnapshots' });
      ProductVariant.hasMany(models.InventoryCommitment, { foreignKey: 'productVariantId', as: 'InventoryCommitments' });
      ProductVariant.hasMany(models.SalesOrderLine, { foreignKey: 'productVariantId', as: 'SalesOrderLines' });
      ProductVariant.hasMany(models.WineClubAllocationItem, { foreignKey: 'productVariantId', as: 'WineClubAllocationItems' });
      ProductVariant.hasMany(models.InventoryDemandMapping, { foreignKey: 'productVariantId', as: 'InventoryDemandMappings' });
      ProductVariant.hasMany(models.ShipmentItem, { foreignKey: 'productVariantId', as: 'ShipmentItems' });
    }
  }
  ProductVariant.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    wineryProductId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'WineryProducts', key: 'id' } },
    code: { type: DataTypes.STRING(100), allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    sku: DataTypes.STRING(160),
    barcode: DataTypes.STRING(160),
    format: DataTypes.STRING(80),
    volume: DataTypes.DECIMAL(12, 3),
    volumeUnit: DataTypes.STRING(40),
    packSize: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
    unitOfMeasure: { type: DataTypes.STRING(40), allowNull: false },
    isSellable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    provenance: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'MANAGER_CREATED' },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize, modelName: 'ProductVariant', tableName: 'ProductVariants', timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'code'], name: 'product_variants_unique_code' },
      { fields: ['wineryId', 'sku'], name: 'product_variants_sku' },
      { fields: ['wineryProductId', 'isDefault'], name: 'product_variants_product_default' }
    ]
  });
  return ProductVariant;
};
