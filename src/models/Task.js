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
      Task.hasMany(models.Message, { foreignKey: 'taskId', as: 'Messages' });
      Task.hasMany(models.TaskAction, { foreignKey: 'taskId' });
      Task.hasMany(models.TaskStep, { foreignKey: 'taskId', as: 'TaskSteps' });
      Task.belongsToMany(models.Notice, {
        through: models.NoticeTask,
        foreignKey: 'taskId',
        otherKey: 'noticeId',
        as: 'LinkedNotices'
      });
      Task.belongsToMany(models.CalendarEvent, {
        through: models.CalendarEventTask,
        foreignKey: 'taskId',
        otherKey: 'calendarEventId',
        as: 'CalendarEvents'
      });
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
          'PENDING',
          'ACTIONED',
          'REJECTED'
        ),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      workflowState: {
        type: DataTypes.ENUM(
          'NOT_STARTED',
          'IN_PROGRESS',
          'WAITING',
          'BLOCKED',
          'COMPLETED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'NOT_STARTED'
      },
      waitingOn: {
        type: DataTypes.ENUM('NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'),
        allowNull: false,
        defaultValue: 'NONE'
      },
      nextStepSummary: { type: DataTypes.STRING, allowNull: true },
      blockedReason: { type: DataTypes.TEXT, allowNull: true },
      dueAt: { type: DataTypes.DATE, allowNull: true },
      resolvedAs: {
        type: DataTypes.ENUM(
          'COMPLETED',
          'WORKAROUND',
          'ESCALATED',
          'DECLINED',
          'DUPLICATE',
          'NO_ACTION'
        ),
        allowNull: true
      },
      resolutionType: {
        type: DataTypes.ENUM(
          'EXECUTED',
          'REPLIED',
          'MANUAL_WORKAROUND',
          'POLICY_DECLINE',
          'CUSTOMER_NO_RESPONSE',
          'NO_ACTION_NEEDED',
          'SPAM_OR_INVALID',
          'EXTERNAL_ESCALATION',
          'INTERNAL_ESCALATION',
          'MERGED_DUPLICATE',
          'ALREADY_RESOLVED',
          'INFO_ONLY'
        ),
        allowNull: true
      },
      customerOutcome: {
        type: DataTypes.ENUM(
          'BOOKING_CONFIRMED',
          'ORDER_UPDATED',
          'ACCOUNT_UPDATED',
          'INFO_PROVIDED',
          'ISSUE_RESOLVED',
          'REQUEST_DECLINED',
          'REFERRED',
          'NO_CHANGE',
          'UNKNOWN'
        ),
        allowNull: true
      },
      resolutionSummary: { type: DataTypes.TEXT, allowNull: true },
      followUpRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      followUpDueAt: { type: DataTypes.DATE, allowNull: true },
      followUpSummary: { type: DataTypes.TEXT, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      payload: { type: DataTypes.JSON, allowNull: true },
      suggestedChannel: {
        type: DataTypes.ENUM('sms', 'email', 'voice', 'none'),
        allowNull: true
      },
      suggestedReplySubject: { type: DataTypes.STRING, allowNull: true },
      suggestedReplyBody: { type: DataTypes.TEXT, allowNull: true },
      suggestedAction: { type: DataTypes.TEXT, allowNull: true },
      suggestedRecipientEmail: { type: DataTypes.STRING, allowNull: true },
      suggestedCc: { type: DataTypes.STRING, allowNull: true },
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
