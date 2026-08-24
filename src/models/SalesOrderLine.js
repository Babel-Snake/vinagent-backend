const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SalesOrderLine extends Model {
    static associate(models) {
      SalesOrderLine.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      SalesOrderLine.belongsTo(models.SalesOrder, { foreignKey: 'salesOrderId', as: 'SalesOrder' });
      SalesOrderLine.belongsTo(models.WineryProduct, { foreignKey: 'wineryProductId', as: 'WineryProduct' });
      SalesOrderLine.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
      SalesOrderLine.hasMany(models.RefundSummary, { foreignKey: 'salesOrderLineId', as: 'Refunds' });
      SalesOrderLine.hasMany(models.ShipmentItem, { foreignKey: 'salesOrderLineId', as: 'ShipmentItems' });
    }
  }

  SalesOrderLine.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    salesOrderId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SalesOrders', key: 'id' } },
    wineryProductId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'WineryProducts', key: 'id' } },
    productVariantId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'ProductVariants', key: 'id' } },
    productResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    lineKey: { type: DataTypes.STRING(160), allowNull: false },
    lineType: { type: DataTypes.STRING(40), allowNull: false },
    providerSku: DataTypes.STRING(160),
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    fulfilledQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    refundedQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    currency: DataTypes.STRING(3),
    unitPriceMinor: DataTypes.INTEGER,
    discountMinor: DataTypes.INTEGER,
    taxMinor: DataTypes.INTEGER,
    totalMinor: DataTypes.INTEGER,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'SalesOrderLine',
    tableName: 'SalesOrderLines',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['salesOrderId', 'lineKey'], name: 'sales_order_lines_unique_line' },
      { fields: ['wineryId', 'providerSku'], name: 'sales_order_lines_sku' },
      { fields: ['wineryId', 'wineryProductId'], name: 'sales_order_lines_product' },
      { fields: ['wineryId', 'productVariantId'], name: 'sales_order_lines_variant' }
    ]
  });

  return SalesOrderLine;
};
