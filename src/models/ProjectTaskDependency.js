const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectTaskDependency extends Model {
    static associate(models) {
      ProjectTaskDependency.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectTaskDependency.belongsTo(models.Project, { foreignKey: 'projectId' });
      ProjectTaskDependency.belongsTo(models.Task, { foreignKey: 'blockingTaskId', as: 'BlockingTask' });
      ProjectTaskDependency.belongsTo(models.Task, { foreignKey: 'blockedTaskId', as: 'BlockedTask' });
      ProjectTaskDependency.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  ProjectTaskDependency.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' } },
    blockingTaskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Tasks', key: 'id' } },
    blockedTaskId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Tasks', key: 'id' } },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'ProjectTaskDependency',
    tableName: 'ProjectTaskDependencies',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['projectId', 'blockingTaskId', 'blockedTaskId'] },
      { fields: ['projectId', 'blockedTaskId'] },
      { fields: ['projectId', 'blockingTaskId'] }
    ]
  });

  return ProjectTaskDependency;
};
