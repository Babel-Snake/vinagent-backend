const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineryLocation extends Model {
    static associate(models) {
      WineryLocation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineryLocation.belongsTo(models.WineryLocation, { foreignKey: 'parentLocationId', as: 'ParentLocation' });
      WineryLocation.hasMany(models.WineryLocation, { foreignKey: 'parentLocationId', as: 'ChildLocations' });
      WineryLocation.hasMany(models.IntegrationConnectionScope, { foreignKey: 'locationId', as: 'ConnectionScopes' });
      WineryLocation.hasMany(models.LocationAreaLink, { foreignKey: 'locationId', as: 'AreaLinks' });
      WineryLocation.hasMany(models.DataAuthorityPolicySet, { foreignKey: 'locationId', as: 'AuthorityPolicySets' });
      WineryLocation.hasMany(models.IntegrationDomainActivation, { foreignKey: 'locationId', as: 'DomainActivations' });
      WineryLocation.hasMany(models.Booking, { foreignKey: 'locationId', as: 'Bookings' });
      WineryLocation.hasMany(models.SalesOrder, { foreignKey: 'locationId', as: 'SalesOrders' });
      WineryLocation.hasMany(models.StockLocation, { foreignKey: 'wineryLocationId', as: 'StockLocations' });
      WineryLocation.hasMany(models.RosterShift, { foreignKey: 'locationId', as: 'RosterShifts' });
      WineryLocation.hasMany(models.WorkforceDemandMapping, {
        foreignKey: 'locationId',
        as: 'WorkforceDemandMappings'
      });
      WineryLocation.hasMany(models.WorkforceCoverageObservation, {
        foreignKey: 'locationId',
        as: 'WorkforceCoverageObservations'
      });
    }
  }

  WineryLocation.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    parentLocationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'WineryLocations', key: 'id' }
    },
    code: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    locationType: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'VENUE' },
    timeZone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Australia/Adelaide' },
    addressLine1: DataTypes.STRING,
    addressLine2: DataTypes.STRING,
    suburb: DataTypes.STRING,
    state: DataTypes.STRING,
    postcode: DataTypes.STRING,
    country: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'WineryLocation',
    tableName: 'WineryLocations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'code'], name: 'winery_locations_unique_code' },
      { fields: ['wineryId', 'isActive', 'locationType'], name: 'winery_locations_active_type' }
    ]
  });

  return WineryLocation;
};
