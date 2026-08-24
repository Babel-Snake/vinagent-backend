const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationCredential extends Model {
    static associate(models) {
      IntegrationCredential.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationCredential.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationCredential.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      IntegrationCredential.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
    }
  }

  IntegrationCredential.init({
    credentialId: { type: DataTypes.STRING(36), allowNull: false },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    credentialType: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    schemaVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    encryptedPayload: DataTypes.TEXT,
    initializationVector: DataTypes.STRING,
    authenticationTag: DataTypes.STRING,
    keyId: { type: DataTypes.STRING(80), allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    rotatedAt: DataTypes.DATE,
    revokedAt: DataTypes.DATE,
    lastUsedAt: DataTypes.DATE,
    lastVerifiedAt: DataTypes.DATE,
    lastVerificationStatus: DataTypes.STRING,
    lastVerificationErrorCode: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'IntegrationCredential',
    tableName: 'IntegrationCredentials',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['credentialId'], name: 'integration_credentials_unique_reference' },
      { fields: ['wineryId', 'connectionId', 'status'], name: 'integration_credentials_connection_status' },
      { fields: ['wineryId', 'lastVerifiedAt'], name: 'integration_credentials_verification' }
    ]
  });

  return IntegrationCredential;
};
