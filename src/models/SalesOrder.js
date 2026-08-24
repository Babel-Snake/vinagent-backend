const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SalesOrder extends Model {
    static associate(models) {
      SalesOrder.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      SalesOrder.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      SalesOrder.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      SalesOrder.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      SalesOrder.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
      SalesOrder.hasMany(models.SalesOrderLine, { foreignKey: 'salesOrderId', as: 'Lines' });
      SalesOrder.hasMany(models.PaymentSummaryEvent, { foreignKey: 'salesOrderId', as: 'PaymentEvents' });
      SalesOrder.hasMany(models.RefundSummary, { foreignKey: 'salesOrderId', as: 'Refunds' });
      SalesOrder.hasMany(models.WineClubAllocation, { foreignKey: 'salesOrderId', as: 'WineClubAllocations' });
      SalesOrder.hasMany(models.Shipment, { foreignKey: 'salesOrderId', as: 'Shipments' });
    }
  }

  SalesOrder.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Members', key: 'id' } },
    locationId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'WineryLocations', key: 'id' } },
    primarySourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    authorityConnectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    customerResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: DataTypes.STRING(120),
    orderNumber: { type: DataTypes.STRING(255), allowNull: false },
    sourceChannel: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    paymentStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    fulfilmentStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    placedAt: DataTypes.DATE,
    paidAt: DataTypes.DATE,
    cancelledAt: DataTypes.DATE,
    fulfilledAt: DataTypes.DATE,
    currency: DataTypes.STRING(3),
    subtotalMinor: DataTypes.INTEGER,
    discountMinor: DataTypes.INTEGER,
    taxMinor: DataTypes.INTEGER,
    shippingMinor: DataTypes.INTEGER,
    totalMinor: DataTypes.INTEGER,
    paidMinor: DataTypes.INTEGER,
    refundedMinor: DataTypes.INTEGER,
    outstandingMinor: DataTypes.INTEGER,
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    projectionQuality: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'SalesOrder',
    tableName: 'SalesOrders',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['primarySourceReferenceId'], name: 'sales_orders_unique_source' },
      { unique: true, fields: ['authorityConnectionId', 'orderNumber'], name: 'sales_orders_unique_connection_number' },
      { fields: ['wineryId', 'canonicalStatus', 'placedAt'], name: 'sales_orders_status_placed' },
      { fields: ['wineryId', 'memberId', 'placedAt'], name: 'sales_orders_member_placed' },
      { fields: ['wineryId', 'paymentStatus', 'fulfilmentStatus'], name: 'sales_orders_attention' }
    ]
  });

  return SalesOrder;
};
