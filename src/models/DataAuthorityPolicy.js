const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DataAuthorityPolicy extends Model {
    static associate(models) {
      DataAuthorityPolicy.belongsTo(models.DataAuthorityPolicySet, { foreignKey: 'policySetId', as: 'PolicySet' });
      DataAuthorityPolicy.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      DataAuthorityPolicy.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      DataAuthorityPolicy.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'Approver' });
      DataAuthorityPolicy.hasMany(models.DataAuthorityPolicySource, { foreignKey: 'policyId', as: 'Sources' });
      DataAuthorityPolicy.hasMany(models.IntegrationDomainActivation, { foreignKey: 'authorityPolicyId', as: 'DomainActivations' });
      DataAuthorityPolicy.hasMany(models.Booking, { foreignKey: 'authorityPolicyId', as: 'Bookings' });
    }
  }

  DataAuthorityPolicy.init({
    policySetId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'DataAuthorityPolicySets', key: 'id' } },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    version: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DRAFT' },
    resolutionStrategy: { type: DataTypes.STRING(80), allowNull: false },
    baselineFreshnessSeconds: DataTypes.INTEGER,
    definition: DataTypes.JSON,
    effectiveFrom: DataTypes.DATE,
    effectiveTo: DataTypes.DATE,
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    approvedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'DataAuthorityPolicy',
    tableName: 'DataAuthorityPolicies',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['policySetId', 'version'], name: 'data_authority_policies_unique_version' },
      { fields: ['wineryId', 'status', 'effectiveFrom'], name: 'data_authority_policies_status_date' }
    ]
  });

  return DataAuthorityPolicy;
};
