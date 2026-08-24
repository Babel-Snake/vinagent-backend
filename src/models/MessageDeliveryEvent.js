const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MessageDeliveryEvent extends Model {
    static associate(models) {
      MessageDeliveryEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      MessageDeliveryEvent.belongsTo(models.Message, { foreignKey: 'messageId', as: 'Message' });
      MessageDeliveryEvent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      MessageDeliveryEvent.belongsTo(models.IntegrationEvent, {
        foreignKey: 'sourceEventId',
        as: 'SourceEvent'
      });
    }
  }

  MessageDeliveryEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    messageId: { type: DataTypes.INTEGER, allowNull: false },
    sourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    sourceEventId: DataTypes.INTEGER,
    eventKey: { type: DataTypes.STRING(180), allowNull: false },
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false },
    providerStatus: DataTypes.STRING(120),
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    failureCategory: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NONE' },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'MessageDeliveryEvent',
    tableName: 'MessageDeliveryEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['sourceReferenceId', 'eventKey'], name: 'message_delivery_events_unique' },
      { fields: ['wineryId', 'canonicalStatus', 'occurredAt'], name: 'message_delivery_events_status' },
      { fields: ['messageId', 'occurredAt'], name: 'message_delivery_events_timeline' },
      { fields: ['sourceReferenceId', 'occurredAt'], name: 'message_delivery_events_source' }
    ]
  });

  return MessageDeliveryEvent;
};
