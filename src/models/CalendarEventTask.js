const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CalendarEventTask extends Model {
    static associate(models) {
      CalendarEventTask.belongsTo(models.CalendarEvent, { foreignKey: 'calendarEventId' });
      CalendarEventTask.belongsTo(models.Task, { foreignKey: 'taskId' });
      CalendarEventTask.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CalendarEventTask.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  CalendarEventTask.init(
    {
      calendarEventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'CalendarEvents', key: 'id' }
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
      modelName: 'CalendarEventTask',
      tableName: 'CalendarEventTasks',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['calendarEventId', 'taskId'] },
        { fields: ['wineryId', 'calendarEventId'] },
        { fields: ['wineryId', 'taskId'] }
      ]
    }
  );

  return CalendarEventTask;
};
