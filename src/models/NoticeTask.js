const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NoticeTask extends Model {
    static associate(models) {
      NoticeTask.belongsTo(models.Notice, { foreignKey: 'noticeId' });
      NoticeTask.belongsTo(models.Task, { foreignKey: 'taskId' });
      NoticeTask.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      NoticeTask.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  NoticeTask.init(
    {
      noticeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Notices', key: 'id' }
      },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Tasks', key: 'id' }
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'NoticeTask',
      tableName: 'NoticeTasks',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['noticeId', 'taskId'] },
        { fields: ['wineryId', 'noticeId'] },
        { fields: ['wineryId', 'taskId'] }
      ]
    }
  );

  return NoticeTask;
};
