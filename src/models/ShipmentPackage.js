const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ShipmentPackage extends Model {
    static associate(models) {
      ShipmentPackage.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ShipmentPackage.belongsTo(models.Shipment, { foreignKey: 'shipmentId', as: 'Shipment' });
      ShipmentPackage.hasMany(models.ShipmentItem, { foreignKey: 'packageId', as: 'Items' });
      ShipmentPackage.hasMany(models.ShipmentTrackingEvent, { foreignKey: 'packageId', as: 'TrackingEvents' });
    }
  }
  ShipmentPackage.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    shipmentId: { type: DataTypes.INTEGER, allowNull: false },
    packageKey: { type: DataTypes.STRING(160), allowNull: false },
    trackingReferenceHash: DataTypes.STRING(64),
    trackingReferenceLast4: DataTypes.STRING(4),
    packageType: DataTypes.STRING(80),
    weight: DataTypes.DECIMAL(12, 3),
    weightUnit: DataTypes.STRING(20),
    length: DataTypes.DECIMAL(12, 3),
    width: DataTypes.DECIMAL(12, 3),
    height: DataTypes.DECIMAL(12, 3),
    dimensionUnit: DataTypes.STRING(20),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    removedAt: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize, modelName: 'ShipmentPackage', tableName: 'ShipmentPackages', timestamps: true,
    indexes: [
      { unique: true, fields: ['shipmentId', 'packageKey'], name: 'shipment_packages_unique_key' },
      { fields: ['wineryId', 'trackingReferenceHash'], name: 'shipment_packages_tracking' }
    ]
  });
  return ShipmentPackage;
};
