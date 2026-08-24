const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerRollupRun extends Model {
    static associate(models) {
      CustomerRollupRun.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerRollupRun.belongsTo(models.User, { foreignKey: 'initiatedBy', as: 'Initiator' });
      CustomerRollupRun.hasMany(models.CustomerRelationshipRollup, { foreignKey: 'lastRunId', as: 'RelationshipRollups' });
      CustomerRollupRun.hasMany(models.CustomerMonetaryRollup, { foreignKey: 'lastRunId', as: 'MonetaryRollups' });
      CustomerRollupRun.hasMany(models.CustomerRollupContribution, { foreignKey: 'runId', as: 'Contributions' });
    }
  }

  CustomerRollupRun.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    requestId: { type: DataTypes.STRING(36), allowNull: false },
    previewToken: { type: DataTypes.STRING(64), allowNull: false },
    inputHash: { type: DataTypes.STRING(64), allowNull: false },
    calculationVersion: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
    initiatedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    reason: { type: DataTypes.TEXT, allowNull: false },
    memberCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    relationshipRollupCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    monetaryRollupCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    contributionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'CustomerRollupRun',
    tableName: 'CustomerRollupRuns',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'requestId'], name: 'customer_rollup_runs_unique_request' },
      { fields: ['wineryId', 'status', 'startedAt'], name: 'customer_rollup_runs_status' }
    ]
  });

  return CustomerRollupRun;
};
