const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ShipmentItem extends Model {
    static associate(models) {
      ShipmentItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ShipmentItem.belongsTo(models.Shipment, { foreignKey: 'shipmentId', as: 'Shipment' });
      ShipmentItem.belongsTo(models.ShipmentPackage, { foreignKey: 'packageId', as: 'Package' });
      ShipmentItem.belongsTo(models.SalesOrderLine, { foreignKey: 'salesOrderLineId', as: 'SalesOrderLine' });
      ShipmentItem.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
    }
  }
  ShipmentItem.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    shipmentId: { type: DataTypes.INTEGER, allowNull: false },
    packageId: DataTypes.INTEGER,
    salesOrderLineId: DataTypes.INTEGER,
    lineResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    productVariantId: DataTypes.INTEGER,
    productResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    itemKey: { type: DataTypes.STRING(160), allowNull: false },
    providerSku: DataTypes.STRING(160),
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    removedAt: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize, modelName: 'ShipmentItem', tableName: 'ShipmentItems', timestamps: true,
    indexes: [
      { unique: true, fields: ['shipmentId', 'itemKey'], name: 'shipment_items_unique_key' },
      { fields: ['wineryId', 'productVariantId', 'isActive'], name: 'shipment_items_variant' },
      { fields: ['wineryId', 'salesOrderLineId'], name: 'shipment_items_order_line' }
    ]
  });
  return ShipmentItem;
};
