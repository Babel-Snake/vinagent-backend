const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutomationRunStep extends Model {
    static associate(models) {
      AutomationRunStep.belongsTo(models.AutomationRun, { foreignKey: 'runId', as: 'Run' });
      AutomationRunStep.belongsTo(models.Winery, { foreignKey: 'wineryId' });
    }
  }

  AutomationRunStep.init({
    runId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'AutomationRuns', key: 'id' }
    },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    stepKey: { type: DataTypes.STRING(80), allowNull: false },
    capability: { type: DataTypes.STRING(160), allowNull: false },
    status: {
      type: DataTypes.ENUM('SUCCEEDED', 'FAILED', 'SKIPPED'),
      allowNull: false
    },
    input: { type: DataTypes.JSON, allowNull: true },
    output: { type: DataTypes.JSON, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    completedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'AutomationRunStep',
    tableName: 'AutomationRunSteps',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['runId', 'stepKey'] },
      { fields: ['wineryId', 'createdAt'] }
    ]
  });

  return AutomationRunStep;
};
