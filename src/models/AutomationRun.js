const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutomationRun extends Model {
    static associate(models) {
      AutomationRun.belongsTo(models.AutomationRule, { foreignKey: 'ruleId', as: 'Rule' });
      AutomationRun.belongsTo(models.AutomationRuleVersion, { foreignKey: 'ruleVersionId', as: 'RuleVersion' });
      AutomationRun.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      AutomationRun.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      AutomationRun.hasMany(models.AutomationRunStep, { foreignKey: 'runId', as: 'Steps' });
      AutomationRun.hasMany(models.OperationalResourceLink, { foreignKey: 'automationRunId', as: 'ResourceLinks' });
      AutomationRun.hasMany(models.AutomationResourceBinding, { foreignKey: 'lastReconciledRunId', as: 'ReconciledResourceBindings' });
    }
  }

  AutomationRun.init({
    ruleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'AutomationRules', key: 'id' }
    },
    ruleVersionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'AutomationRuleVersions', key: 'id' }
    },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    sourceEventId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationEvents', key: 'id' }
    },
    sourceKey: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.ENUM('RUNNING', 'NOT_MATCHED', 'ACTIONED', 'SKIPPED', 'FAILED'),
      allowNull: false,
      defaultValue: 'RUNNING'
    },
    triggerSnapshot: { type: DataTypes.JSON, allowNull: true },
    contextSnapshot: { type: DataTypes.JSON, allowNull: true },
    decisionSnapshot: { type: DataTypes.JSON, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    actionItemType: { type: DataTypes.ENUM('TASK', 'NOTICE'), allowNull: true },
    actionItemId: { type: DataTypes.INTEGER, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    completedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'AutomationRun',
    tableName: 'AutomationRuns',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['ruleId', 'sourceKey'] },
      { fields: ['wineryId', 'status', 'createdAt'] },
      { fields: ['sourceEventId'] }
    ]
  });

  return AutomationRun;
};
