const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notice extends Model {
    static associate(models) {
      Notice.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Notice.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Author' });
      Notice.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      Notice.belongsTo(models.User, { foreignKey: 'archivedBy', as: 'Archiver' });
      Notice.belongsToMany(models.Task, {
        through: models.NoticeTask,
        foreignKey: 'noticeId',
        otherKey: 'taskId',
        as: 'LinkedTasks'
      });
      Notice.hasMany(models.NoticeComment, { foreignKey: 'noticeId', as: 'Comments' });
      Notice.belongsToMany(models.CalendarEvent, {
        through: models.CalendarEventNotice,
        foreignKey: 'noticeId',
        otherKey: 'calendarEventId',
        as: 'CalendarEvents'
      });
      if (models.IntegrationEvent) {
        Notice.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      }
    }
  }

  Notice.init(
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      category: {
        type: DataTypes.ENUM(
          'GENERAL',
          'WINE',
          'VINTAGE_CHANGE',
          'PRICING',
          'STOCK',
          'CUSTOMERS',
          'MAINTENANCE',
          'EVENTS',
          'STAFF',
          'WINE_CLUB',
          'URGENT'
        ),
        allowNull: false,
        defaultValue: 'GENERAL'
      },
      priority: {
        type: DataTypes.ENUM('normal', 'important', 'urgent'),
        allowNull: false,
        defaultValue: 'normal'
      },
      isPinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      audienceType: {
        type: DataTypes.ENUM('all_staff', 'roles', 'users'),
        allowNull: false,
        defaultValue: 'all_staff'
      },
      audienceRoles: {
        type: DataTypes.JSON,
        allowNull: true
      },
      audienceUserIds: {
        type: DataTypes.JSON,
        allowNull: true
      },
      effectiveFrom: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      externalSource: {
        type: DataTypes.STRING,
        allowNull: true
      },
      externalId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      externalPostedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      externalAuthorName: {
        type: DataTypes.STRING,
        allowNull: true
      },
      sourceEventId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'IntegrationEvents', key: 'id' }
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
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      archivedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'Notice',
      tableName: 'Notices',
      timestamps: true
    }
  );

  return Notice;
};
