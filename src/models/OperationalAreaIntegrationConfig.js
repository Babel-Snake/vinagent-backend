const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalAreaIntegrationConfig extends Model {
    static associate(models) {
      OperationalAreaIntegrationConfig.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalAreaIntegrationConfig.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  OperationalAreaIntegrationConfig.init(
    {
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'OperationalAreas', key: 'id' }
      },
      providerConnections: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
      }
    },
    {
      sequelize,
      modelName: 'OperationalAreaIntegrationConfig',
      tableName: 'OperationalAreaIntegrationConfigs',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['areaId'] },
        { fields: ['wineryId', 'areaId'] }
      ]
    }
  );

  return OperationalAreaIntegrationConfig;
};
