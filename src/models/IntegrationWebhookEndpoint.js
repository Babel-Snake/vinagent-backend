const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationWebhookEndpoint extends Model {
    static associate(models) {
      IntegrationWebhookEndpoint.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationWebhookEndpoint.belongsTo(models.IntegrationConnection, {
        foreignKey: 'connectionId',
        as: 'Connection'
      });
      IntegrationWebhookEndpoint.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      IntegrationWebhookEndpoint.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
    }
  }

  IntegrationWebhookEndpoint.init({
    endpointKey: { type: DataTypes.STRING(36), allowNull: false },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    domain: { type: DataTypes.STRING(40), allowNull: false },
    adapterKey: { type: DataTypes.STRING(120), allowNull: false },
    adapterVersion: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    verificationSchemaVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    encryptedVerificationMaterial: { type: DataTypes.TEXT, allowNull: true },
    initializationVector: { type: DataTypes.STRING, allowNull: true },
    authenticationTag: { type: DataTypes.STRING, allowNull: true },
    keyId: { type: DataTypes.STRING(80), allowNull: false },
    configuration: { type: DataTypes.JSON, allowNull: true },
    rotatedAt: { type: DataTypes.DATE, allowNull: true },
    disabledAt: { type: DataTypes.DATE, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    lastReceivedAt: { type: DataTypes.DATE, allowNull: true },
    lastVerifiedAt: { type: DataTypes.DATE, allowNull: true },
    lastErrorCode: { type: DataTypes.STRING(120), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'IntegrationWebhookEndpoint',
    tableName: 'IntegrationWebhookEndpoints',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['endpointKey'], name: 'integration_webhook_endpoints_unique_key' },
      {
        fields: ['wineryId', 'connectionId', 'domain', 'status'],
        name: 'integration_webhook_endpoints_connection_domain_status'
      },
      { fields: ['wineryId', 'lastReceivedAt'], name: 'integration_webhook_endpoints_last_received' }
    ]
  });

  return IntegrationWebhookEndpoint;
};
