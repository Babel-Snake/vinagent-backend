const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DataAuthorityPolicySource extends Model {
    static associate(models) {
      DataAuthorityPolicySource.belongsTo(models.DataAuthorityPolicy, { foreignKey: 'policyId', as: 'Policy' });
      DataAuthorityPolicySource.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      DataAuthorityPolicySource.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
    }
  }

  DataAuthorityPolicySource.init({
    policyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'DataAuthorityPolicies', key: 'id' } },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    connectionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'IntegrationConnections', key: 'id' } },
    sourceRole: { type: DataTypes.STRING(24), allowNull: false },
    sourceOrder: { type: DataTypes.INTEGER, allowNull: false },
    configuration: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'DataAuthorityPolicySource',
    tableName: 'DataAuthorityPolicySources',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['policyId', 'connectionId'], name: 'data_authority_policy_sources_unique_connection' },
      { unique: true, fields: ['policyId', 'sourceOrder'], name: 'data_authority_policy_sources_unique_order' }
    ]
  });

  return DataAuthorityPolicySource;
};
