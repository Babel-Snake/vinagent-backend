const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RefundSummary extends Model {
    static associate(models) {
      RefundSummary.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      RefundSummary.belongsTo(models.SalesOrder, { foreignKey: 'salesOrderId', as: 'SalesOrder' });
      RefundSummary.belongsTo(models.SalesOrderLine, { foreignKey: 'salesOrderLineId', as: 'SalesOrderLine' });
      RefundSummary.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      RefundSummary.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
    }
  }

  RefundSummary.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    salesOrderId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SalesOrders', key: 'id' } },
    salesOrderLineId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'SalesOrderLines', key: 'id' } },
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
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false },
    providerStatus: DataTypes.STRING(120),
    providerTransactionReference: DataTypes.STRING(255),
    amountMinor: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    reasonCategory: DataTypes.STRING(120),
    requestedAt: DataTypes.DATE,
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: DataTypes.DATE,
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    projectionQuality: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'RefundSummary',
    tableName: 'RefundSummaries',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['primarySourceReferenceId'], name: 'refund_summaries_unique_source' },
      { fields: ['wineryId', 'canonicalStatus', 'effectiveAt'], name: 'refund_summaries_attention' },
      { fields: ['salesOrderId', 'salesOrderLineId'], name: 'refund_summaries_order_line' }
    ]
  });

  return RefundSummary;
};
