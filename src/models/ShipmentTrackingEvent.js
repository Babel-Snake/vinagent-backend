const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ShipmentTrackingEvent extends Model {
    static associate(models) {
      ShipmentTrackingEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ShipmentTrackingEvent.belongsTo(models.Shipment, { foreignKey: 'shipmentId', as: 'Shipment' });
      ShipmentTrackingEvent.belongsTo(models.ShipmentPackage, { foreignKey: 'packageId', as: 'Package' });
      ShipmentTrackingEvent.belongsTo(models.ExternalResourceReference, { foreignKey: 'sourceReferenceId', as: 'SourceReference' });
      ShipmentTrackingEvent.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }
  ShipmentTrackingEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    shipmentId: { type: DataTypes.INTEGER, allowNull: false },
    packageId: DataTypes.INTEGER,
    sourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    sourceEventId: DataTypes.INTEGER,
    eventKey: { type: DataTypes.STRING(180), allowNull: false },
    canonicalCode: { type: DataTypes.STRING(40), allowNull: false },
    providerCode: DataTypes.STRING(120),
    description: DataTypes.STRING(255),
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    locationSummary: DataTypes.STRING(160),
    exceptionCategory: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NONE' },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    metadata: DataTypes.JSON
  }, {
    sequelize, modelName: 'ShipmentTrackingEvent', tableName: 'ShipmentTrackingEvents',
    timestamps: true, updatedAt: false,
    indexes: [
      { unique: true, fields: ['shipmentId', 'eventKey'], name: 'shipment_tracking_events_unique' },
      { fields: ['wineryId', 'exceptionCategory', 'occurredAt'], name: 'shipment_tracking_events_exception' },
      { fields: ['shipmentId', 'occurredAt'], name: 'shipment_tracking_events_timeline' }
    ]
  });
  return ShipmentTrackingEvent;
};
