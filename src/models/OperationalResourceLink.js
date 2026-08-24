const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalResourceLink extends Model {
    static associate(models) {
      OperationalResourceLink.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalResourceLink.belongsTo(models.AutomationRule, { foreignKey: 'automationRuleId', as: 'AutomationRule' });
      OperationalResourceLink.belongsTo(models.AutomationRun, { foreignKey: 'automationRunId', as: 'AutomationRun' });
      OperationalResourceLink.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      OperationalResourceLink.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  OperationalResourceLink.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    itemType: { type: DataTypes.STRING(40), allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    resourceType: { type: DataTypes.STRING(120), allowNull: false },
    resourceId: { type: DataTypes.INTEGER, allowNull: false },
    linkType: { type: DataTypes.STRING(80), allowNull: false },
    automationRuleId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'AutomationRules', key: 'id' } },
    automationRunId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'AutomationRuns', key: 'id' } },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    metadata: DataTypes.JSON,
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalResourceLink',
    tableName: 'OperationalResourceLinks',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'itemType', 'itemId', 'resourceType', 'resourceId', 'linkType'],
        name: 'operational_resource_links_unique'
      },
      { fields: ['wineryId', 'resourceType', 'resourceId'], name: 'operational_resource_links_resource' },
      { fields: ['wineryId', 'itemType', 'itemId'], name: 'operational_resource_links_item' }
    ]
  });

  return OperationalResourceLink;
};
