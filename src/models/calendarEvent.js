
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CalendarEvent extends Model {
        static associate(models) {
            CalendarEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            CalendarEvent.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
            CalendarEvent.belongsTo(models.Task, { foreignKey: 'taskId', as: 'LinkedTask' });
            CalendarEvent.belongsTo(models.Notice, { foreignKey: 'noticeId', as: 'LinkedNotice' });
            CalendarEvent.belongsToMany(models.Task, {
                through: models.CalendarEventTask,
                foreignKey: 'calendarEventId',
                otherKey: 'taskId',
                as: 'LinkedTasks'
            });
            CalendarEvent.belongsToMany(models.Notice, {
                through: models.CalendarEventNotice,
                foreignKey: 'calendarEventId',
                otherKey: 'noticeId',
                as: 'LinkedNotices'
            });
        }
    }

    CalendarEvent.init(
        {
            title: {
                type: DataTypes.STRING,
                allowNull: false
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            start: {
                type: DataTypes.DATE,
                allowNull: false
            },
            end: {
                type: DataTypes.DATE,
                allowNull: false
            },
            allDay: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            type: {
                type: DataTypes.ENUM('reminder', 'meeting', 'event', 'task_deadline', 'notice', 'other'),
                defaultValue: 'other'
            },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Wineries',
                    key: 'id'
                }
            },
            createdBy: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                }
            },
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Tasks',
                    key: 'id'
                }
            },
            noticeId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Notices',
                    key: 'id'
                }
            }
        },
        {
            sequelize,
            modelName: 'CalendarEvent',
            tableName: 'CalendarEvents',
            timestamps: true
        }
    );

    return CalendarEvent;
};
