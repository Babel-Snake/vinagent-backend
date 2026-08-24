const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DataAuthorityPolicySet extends Model {
    static associate(models) {
      DataAuthorityPolicySet.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      DataAuthorityPolicySet.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      DataAuthorityPolicySet.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      DataAuthorityPolicySet.belongsTo(models.DataAuthorityPolicy, { foreignKey: 'activePolicyId', as: 'ActivePolicy' });
      DataAuthorityPolicySet.hasMany(models.DataAuthorityPolicy, { foreignKey: 'policySetId', as: 'Versions' });
    }
  }

  DataAuthorityPolicySet.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    scopeKey: { type: DataTypes.STRING(180), allowNull: false },
    areaId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'OperationalAreas', key: 'id' } },
    locationId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'WineryLocations', key: 'id' } },
    domain: { type: DataTypes.STRING(80), allowNull: false },
    fieldGroup: { type: DataTypes.STRING(120), allowNull: false },
    activePolicyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'DataAuthorityPolicies', key: 'id' } },
    lockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'DataAuthorityPolicySet',
    tableName: 'DataAuthorityPolicySets',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'scopeKey', 'domain', 'fieldGroup'], name: 'data_authority_policy_sets_unique' },
      { fields: ['wineryId', 'domain', 'fieldGroup', 'scopeKey'], name: 'data_authority_policy_sets_lookup' },
      { fields: ['activePolicyId'], name: 'data_authority_policy_sets_active_policy' }
    ]
  });

  return DataAuthorityPolicySet;
};
