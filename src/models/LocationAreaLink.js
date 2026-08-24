const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LocationAreaLink extends Model {
    static associate(models) {
      LocationAreaLink.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      LocationAreaLink.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      LocationAreaLink.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      LocationAreaLink.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  LocationAreaLink.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    locationId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'WineryLocations', key: 'id' } },
    areaId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' } },
    relationshipType: { type: DataTypes.STRING(80), allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'LocationAreaLink',
    tableName: 'LocationAreaLinks',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'locationId', 'areaId', 'relationshipType'], name: 'location_area_links_unique' },
      { fields: ['wineryId', 'areaId'], name: 'location_area_links_area' }
    ]
  });

  return LocationAreaLink;
};
