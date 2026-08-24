const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutomationRule extends Model {
    static associate(models) {
      AutomationRule.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      AutomationRule.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      AutomationRule.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      AutomationRule.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      AutomationRule.belongsTo(models.User, { foreignKey: 'activatedBy', as: 'Activator' });
      AutomationRule.hasMany(models.AutomationRuleVersion, { foreignKey: 'ruleId', as: 'Versions' });
      AutomationRule.hasMany(models.AutomationRun, { foreignKey: 'ruleId', as: 'Runs' });
      AutomationRule.hasMany(models.AutomationResourceBinding, { foreignKey: 'ruleId', as: 'ResourceBindings' });
      AutomationRule.hasMany(models.OperationalResourceLink, { foreignKey: 'automationRuleId', as: 'ResourceLinks' });
    }
  }

  AutomationRule.init({
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'PAUSED'),
      allowNull: false,
      defaultValue: 'DRAFT'
    },
    triggerType: { type: DataTypes.STRING(120), allowNull: false },
    currentVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    areaId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'OperationalAreas', key: 'id' }
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    activatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    activatedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'AutomationRule',
    tableName: 'AutomationRules',
    timestamps: true,
    indexes: [
      { fields: ['wineryId', 'status', 'triggerType'] },
      { fields: ['wineryId', 'areaId', 'status'] }
    ]
  });

  return AutomationRule;
};
