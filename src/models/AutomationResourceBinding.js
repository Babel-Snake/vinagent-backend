const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutomationResourceBinding extends Model {
    static associate(models) {
      AutomationResourceBinding.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      AutomationResourceBinding.belongsTo(models.AutomationRule, { foreignKey: 'ruleId', as: 'Rule' });
      AutomationResourceBinding.belongsTo(models.AutomationRuleVersion, { foreignKey: 'ruleVersionId', as: 'RuleVersion' });
      AutomationResourceBinding.belongsTo(models.AutomationRun, { foreignKey: 'lastReconciledRunId', as: 'LastReconciledRun' });
      AutomationResourceBinding.belongsTo(models.IntegrationEvent, { foreignKey: 'lastReconciledEventId', as: 'LastReconciledEvent' });
      AutomationResourceBinding.belongsTo(models.User, { foreignKey: 'humanOverrideBy', as: 'HumanOverrideActor' });
    }
  }

  AutomationResourceBinding.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    ruleId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'AutomationRules', key: 'id' } },
    ruleVersionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'AutomationRuleVersions', key: 'id' } },
    resourceType: { type: DataTypes.STRING(120), allowNull: false },
    resourceId: { type: DataTypes.INTEGER, allowNull: false },
    purposeKey: { type: DataTypes.STRING(160), allowNull: false },
    itemType: { type: DataTypes.STRING(40), allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    lifecycleState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: true },
    lastReconciledRunId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'AutomationRuns', key: 'id' } },
    lastReconciledEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    managedFields: { type: DataTypes.JSON, allowNull: false },
    lastAppliedSnapshot: { type: DataTypes.JSON, allowNull: false },
    configurationSnapshot: { type: DataTypes.JSON, allowNull: false },
    reconciliationPolicy: { type: DataTypes.JSON, allowNull: false },
    humanOverrideAt: { type: DataTypes.DATE, allowNull: true },
    humanOverrideBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    humanOverrideReason: { type: DataTypes.STRING(255), allowNull: true },
    lastDecision: { type: DataTypes.STRING(40), allowNull: true },
    lastDecisionReason: { type: DataTypes.STRING(255), allowNull: true },
    lastReconciledAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'AutomationResourceBinding',
    tableName: 'AutomationResourceBindings',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'ruleId', 'resourceType', 'resourceId', 'purposeKey'],
        name: 'automation_resource_bindings_unique_purpose'
      },
      {
        fields: ['wineryId', 'resourceType', 'resourceId', 'lifecycleState'],
        name: 'automation_resource_bindings_resource_state'
      },
      { fields: ['wineryId', 'itemType', 'itemId'], name: 'automation_resource_bindings_item' }
    ]
  });

  return AutomationResourceBinding;
};
