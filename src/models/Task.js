const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Task extends Model {
    static associate(models) {
      Task.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Task.belongsTo(models.Member, { foreignKey: 'memberId' });
      Task.belongsTo(models.Message, { foreignKey: 'messageId' });
      Task.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      Task.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      Task.belongsTo(models.User, { foreignKey: 'assigneeId', as: 'Assignee' });
      Task.belongsTo(models.Task, { foreignKey: 'parentTaskId', as: 'ParentTask' });
      Task.hasMany(models.Task, { foreignKey: 'parentTaskId', as: 'SubTasks' });
      Task.hasMany(models.TaskAction, { foreignKey: 'taskId' });
    }
  }

  Task.init(
    {
      type: {
        type: DataTypes.STRING, // Legacy supported, deprecated
        allowNull: true
      },
      category: {
        type: DataTypes.ENUM('BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'INTERNAL', 'SYSTEM', 'OPERATIONS'),
        allowNull: true
      },
      subType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      customerType: {
        type: DataTypes.ENUM('MEMBER', 'VISITOR', 'UNKNOWN'),
        defaultValue: 'UNKNOWN',
        allowNull: false
      },
      sentiment: {
        type: DataTypes.ENUM('NEUTRAL', 'POSITIVE', 'NEGATIVE'),
        defaultValue: 'NEUTRAL',
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM(
          'PENDING_REVIEW',
          'APPROVED',
          'AWAITING_MEMBER_ACTION',
          'REJECTED',
          'EXECUTED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'PENDING_REVIEW'
      },
      payload: { type: DataTypes.JSON, allowNull: true },
      suggestedChannel: {
        type: DataTypes.ENUM('sms', 'email', 'voice', 'none'),
        allowNull: true
      },
      suggestedReplySubject: { type: DataTypes.STRING, allowNull: true },
      suggestedReplyBody: { type: DataTypes.TEXT, allowNull: true },
      requiresApproval: { type: DataTypes.BOOLEAN, defaultValue: true },
      priority: {
        type: DataTypes.ENUM('low', 'normal', 'high'),
        defaultValue: 'normal'
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      memberId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Members', key: 'id' }
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Messages', key: 'id' }
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
      assigneeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      parentTaskId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Tasks', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'Task',
      tableName: 'Tasks',
      timestamps: true
    }
  );

  return Task;
};
