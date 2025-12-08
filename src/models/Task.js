const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Task extends Model {
    static associate(models) {
      Task.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Task.belongsTo(models.Member, { foreignKey: 'memberId' });
      Task.belongsTo(models.Message, { foreignKey: 'messageId' });
      Task.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      Task.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      Task.hasMany(models.TaskAction, { foreignKey: 'taskId' });
    }
  }

  Task.init(
    {
      type: {
        type: DataTypes.ENUM(
          'GENERAL_QUERY',
          'ADDRESS_CHANGE',
          'PAYMENT_ISSUE',
          'BOOKING_REQUEST',
          'DELIVERY_ISSUE'
        ),
        allowNull: false
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
        type: DataTypes.ENUM('sms', 'email', 'none'),
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
