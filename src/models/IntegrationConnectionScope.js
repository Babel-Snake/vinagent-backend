const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationConnectionScope extends Model {
    static associate(models) {
      IntegrationConnectionScope.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationConnectionScope.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationConnectionScope.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      IntegrationConnectionScope.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
    }
  }

  IntegrationConnectionScope.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    domain: { type: DataTypes.STRING(80), allowNull: false },
    scopeKey: { type: DataTypes.STRING(180), allowNull: false },
    areaId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'OperationalAreas', key: 'id' }
    },
    locationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'WineryLocations', key: 'id' }
    },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    sequelize,
    modelName: 'IntegrationConnectionScope',
    tableName: 'IntegrationConnectionScopes',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['connectionId', 'domain', 'scopeKey'], name: 'integration_connection_scopes_unique' },
      { fields: ['wineryId', 'domain', 'scopeKey', 'isActive'], name: 'integration_connection_scopes_lookup' }
    ]
  });

  return IntegrationConnectionScope;
};
