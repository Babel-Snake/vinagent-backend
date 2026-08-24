const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutomationRuleVersion extends Model {
    static associate(models) {
      AutomationRuleVersion.belongsTo(models.AutomationRule, { foreignKey: 'ruleId', as: 'Rule' });
      AutomationRuleVersion.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      AutomationRuleVersion.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      AutomationRuleVersion.hasMany(models.AutomationRun, { foreignKey: 'ruleVersionId', as: 'Runs' });
      AutomationRuleVersion.hasMany(models.AutomationResourceBinding, { foreignKey: 'ruleVersionId', as: 'ResourceBindings' });
    }
  }

  AutomationRuleVersion.init({
    ruleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'AutomationRules', key: 'id' }
    },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    version: { type: DataTypes.INTEGER, allowNull: false },
    definition: { type: DataTypes.JSON, allowNull: false },
    definitionHash: { type: DataTypes.STRING(64), allowNull: false },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'AutomationRuleVersion',
    tableName: 'AutomationRuleVersions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['ruleId', 'version'] },
      { fields: ['wineryId', 'createdAt'] }
    ]
  });

  return AutomationRuleVersion;
};
