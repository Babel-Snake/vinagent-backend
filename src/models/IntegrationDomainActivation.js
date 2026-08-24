const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationDomainActivation extends Model {
    static associate(models) {
      IntegrationDomainActivation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationDomainActivation.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationDomainActivation.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      IntegrationDomainActivation.belongsTo(models.DataAuthorityPolicy, { foreignKey: 'authorityPolicyId', as: 'AuthorityPolicy' });
      IntegrationDomainActivation.belongsTo(models.User, { foreignKey: 'activatedBy', as: 'Activator' });
      IntegrationDomainActivation.belongsTo(models.User, { foreignKey: 'disabledBy', as: 'Disabler' });
    }
  }

  IntegrationDomainActivation.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    connectionId: { type: DataTypes.INTEGER, allowNull: false },
    domain: { type: DataTypes.STRING(80), allowNull: false },
    scopeKey: { type: DataTypes.STRING(180), allowNull: false, defaultValue: 'winery' },
    locationId: DataTypes.INTEGER,
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    sourceWatermarkAt: { type: DataTypes.DATE, allowNull: false },
    activatedAt: { type: DataTypes.DATE, allowNull: false },
    activatedBy: DataTypes.INTEGER,
    activationReason: { type: DataTypes.TEXT, allowNull: false },
    requestId: { type: DataTypes.STRING(36), allowNull: false },
    previewHash: { type: DataTypes.STRING(64), allowNull: false },
    previewSnapshot: { type: DataTypes.JSON, allowNull: false },
    authorityPolicyId: { type: DataTypes.INTEGER, allowNull: false },
    disabledAt: DataTypes.DATE,
    disabledBy: DataTypes.INTEGER,
    disabledReason: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'IntegrationDomainActivation',
    tableName: 'IntegrationDomainActivations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['connectionId', 'domain', 'scopeKey'], name: 'integration_domain_activations_unique' },
      { unique: true, fields: ['wineryId', 'requestId'], name: 'integration_domain_activations_request' },
      { fields: ['wineryId', 'domain', 'status'], name: 'integration_domain_activations_status' }
    ]
  });

  return IntegrationDomainActivation;
};
