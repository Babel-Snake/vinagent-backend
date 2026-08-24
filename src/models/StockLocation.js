const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockLocation extends Model {
    static associate(models) {
      StockLocation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      StockLocation.belongsTo(models.WineryLocation, { foreignKey: 'wineryLocationId', as: 'WineryLocation' });
      StockLocation.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      StockLocation.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      StockLocation.hasMany(models.InventoryPosition, { foreignKey: 'stockLocationId', as: 'InventoryPositions' });
      StockLocation.hasMany(models.InventorySnapshot, { foreignKey: 'stockLocationId', as: 'InventorySnapshots' });
      StockLocation.hasMany(models.InventoryCommitment, { foreignKey: 'stockLocationId', as: 'InventoryCommitments' });
      StockLocation.hasMany(models.InventoryDemandMapping, { foreignKey: 'stockLocationId', as: 'InventoryDemandMappings' });
    }
  }
  StockLocation.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    wineryLocationId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'WineryLocations', key: 'id' } },
    code: { type: DataTypes.STRING(100), allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    locationType: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'GENERAL' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    provenance: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'MANAGER_CREATED' },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize, modelName: 'StockLocation', tableName: 'StockLocations', timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'code'], name: 'stock_locations_unique_code' },
      { fields: ['wineryLocationId', 'isDefault'], name: 'stock_locations_winery_location_default' }
    ]
  });
  return StockLocation;
};
