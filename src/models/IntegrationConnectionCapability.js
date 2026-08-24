const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationConnectionCapability extends Model {
    static associate(models) {
      IntegrationConnectionCapability.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationConnectionCapability.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
    }
  }

  IntegrationConnectionCapability.init({
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
    capabilityKey: { type: DataTypes.STRING(160), allowNull: false },
    kind: { type: DataTypes.STRING(24), allowNull: false },
    contractVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    availabilityStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'AVAILABLE' },
    maxProjectionAgeSeconds: DataTypes.INTEGER,
    supportsWebhook: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    supportsPolling: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lastVerifiedAt: DataTypes.DATE,
    unavailableReason: DataTypes.TEXT,
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'IntegrationConnectionCapability',
    tableName: 'IntegrationConnectionCapabilities',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['connectionId', 'capabilityKey', 'contractVersion'],
        name: 'integration_connection_capabilities_unique'
      },
      { fields: ['wineryId', 'capabilityKey', 'enabled'], name: 'integration_connection_capabilities_lookup' }
    ]
  });

  return IntegrationConnectionCapability;
};
