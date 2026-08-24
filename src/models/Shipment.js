const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Shipment extends Model {
    static associate(models) {
      Shipment.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Shipment.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      Shipment.belongsTo(models.SalesOrder, { foreignKey: 'salesOrderId', as: 'SalesOrder' });
      Shipment.belongsTo(models.WineClubAllocation, { foreignKey: 'wineClubAllocationId', as: 'WineClubAllocation' });
      Shipment.belongsTo(models.CustomerAddress, { foreignKey: 'restrictedAddressId', as: 'RestrictedAddress' });
      Shipment.belongsTo(models.ExternalResourceReference, { foreignKey: 'primarySourceReferenceId', as: 'PrimarySourceReference' });
      Shipment.belongsTo(models.IntegrationConnection, { foreignKey: 'authorityConnectionId', as: 'AuthorityConnection' });
      Shipment.hasMany(models.ShipmentPackage, { foreignKey: 'shipmentId', as: 'Packages' });
      Shipment.hasMany(models.ShipmentItem, { foreignKey: 'shipmentId', as: 'Items' });
      Shipment.hasMany(models.ShipmentTrackingEvent, { foreignKey: 'shipmentId', as: 'TrackingEvents' });
    }
  }
  Shipment.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    memberId: DataTypes.INTEGER,
    customerResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    salesOrderId: DataTypes.INTEGER,
    orderResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    wineClubAllocationId: DataTypes.INTEGER,
    allocationResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    restrictedAddressId: DataTypes.INTEGER,
    primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    carrierKey: { type: DataTypes.STRING(120), allowNull: false },
    serviceLevel: DataTypes.STRING(120),
    trackingReferenceHash: DataTypes.STRING(64),
    trackingReferenceLast4: DataTypes.STRING(4),
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: DataTypes.STRING(120),
    promisedDeliveryAt: DataTypes.DATE,
    shippedAt: DataTypes.DATE,
    estimatedDeliveryAt: DataTypes.DATE,
    deliveredAt: DataTypes.DATE,
    returnedAt: DataTypes.DATE,
    latestTrackingOccurredAt: DataTypes.DATE,
    latestExceptionCategory: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NONE' },
    latestExceptionCode: DataTypes.STRING(120),
    latestExceptionSummary: DataTypes.STRING(255),
    destinationCountry: DataTypes.STRING(2),
    destinationRegion: DataTypes.STRING(80),
    destinationPostcodePrefix: DataTypes.STRING(4),
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    projectionQuality: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize, modelName: 'Shipment', tableName: 'Shipments', timestamps: true,
    indexes: [
      { unique: true, fields: ['primarySourceReferenceId'], name: 'shipments_unique_source' },
      { unique: true, fields: ['authorityConnectionId', 'trackingReferenceHash'], name: 'shipments_unique_tracking_reference' },
      { fields: ['wineryId', 'canonicalStatus', 'estimatedDeliveryAt'], name: 'shipments_status_delivery' },
      { fields: ['wineryId', 'latestExceptionCategory', 'latestTrackingOccurredAt'], name: 'shipments_exception_attention' },
      { fields: ['wineryId', 'memberId', 'createdAt'], name: 'shipments_member_history' },
      { fields: ['wineryId', 'salesOrderId'], name: 'shipments_order' },
      { fields: ['wineryId', 'wineClubAllocationId'], name: 'shipments_allocation' }
    ]
  });
  return Shipment;
};
