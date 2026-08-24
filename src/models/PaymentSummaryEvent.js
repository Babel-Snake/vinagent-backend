const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentSummaryEvent extends Model {
    static associate(models) {
      PaymentSummaryEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      PaymentSummaryEvent.belongsTo(models.SalesOrder, { foreignKey: 'salesOrderId', as: 'SalesOrder' });
      PaymentSummaryEvent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      PaymentSummaryEvent.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }

  PaymentSummaryEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    salesOrderId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'SalesOrders', key: 'id' } },
    eventKey: { type: DataTypes.STRING(180), allowNull: false },
    eventType: { type: DataTypes.STRING(40), allowNull: false },
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false },
    providerTransactionReference: DataTypes.STRING(255),
    paymentMethodClass: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    amountMinor: DataTypes.INTEGER,
    currency: DataTypes.STRING(3),
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    failureCategory: DataTypes.STRING(120),
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    metadata: DataTypes.JSON,
    createdAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'PaymentSummaryEvent',
    tableName: 'PaymentSummaryEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['salesOrderId', 'eventKey'], name: 'payment_summary_events_unique' },
      { fields: ['wineryId', 'canonicalStatus', 'effectiveAt'], name: 'payment_summary_events_attention' }
    ]
  });

  return PaymentSummaryEvent;
};
