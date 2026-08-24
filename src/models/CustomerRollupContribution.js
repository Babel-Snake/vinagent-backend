const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerRollupContribution extends Model {
    static associate(models) {
      CustomerRollupContribution.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerRollupContribution.belongsTo(models.CustomerRollupRun, { foreignKey: 'runId', as: 'Run' });
      CustomerRollupContribution.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
    }
  }

  CustomerRollupContribution.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    runId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'CustomerRollupRuns', key: 'id' } },
    contributionKey: { type: DataTypes.STRING(64), allowNull: false },
    subjectMemberId: { type: DataTypes.INTEGER, allowNull: false },
    resourceType: { type: DataTypes.STRING(120), allowNull: false },
    resourceId: { type: DataTypes.INTEGER, allowNull: false },
    contributionType: { type: DataTypes.STRING(80), allowNull: false },
    currency: DataTypes.STRING(3),
    amountMinor: DataTypes.BIGINT,
    effectiveAt: DataTypes.DATE,
    authorityConnectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    metadata: DataTypes.JSON,
    createdAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'CustomerRollupContribution',
    tableName: 'CustomerRollupContributions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['runId', 'contributionKey'], name: 'customer_rollup_contributions_unique' },
      { fields: ['wineryId', 'subjectMemberId', 'runId'], name: 'customer_rollup_contributions_member' },
      { fields: ['wineryId', 'resourceType', 'resourceId'], name: 'customer_rollup_contributions_resource' }
    ]
  });

  return CustomerRollupContribution;
};
