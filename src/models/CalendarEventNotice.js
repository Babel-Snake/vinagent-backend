const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CalendarEventNotice extends Model {
    static associate(models) {
      CalendarEventNotice.belongsTo(models.CalendarEvent, { foreignKey: 'calendarEventId' });
      CalendarEventNotice.belongsTo(models.Notice, { foreignKey: 'noticeId' });
      CalendarEventNotice.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CalendarEventNotice.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  CalendarEventNotice.init(
    {
      calendarEventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'CalendarEvents', key: 'id' }
      },
      noticeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Notices', key: 'id' }
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
      modelName: 'CalendarEventNotice',
      tableName: 'CalendarEventNotices',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['calendarEventId', 'noticeId'] },
        { fields: ['wineryId', 'calendarEventId'] },
        { fields: ['wineryId', 'noticeId'] }
      ]
    }
  );

  return CalendarEventNotice;
};
