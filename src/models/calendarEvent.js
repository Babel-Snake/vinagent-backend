
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CalendarEvent extends Model {
        static associate(models) {
            CalendarEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            CalendarEvent.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
            CalendarEvent.belongsTo(models.Task, { foreignKey: 'taskId', as: 'LinkedTask' });
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
                type: DataTypes.ENUM('reminder', 'meeting', 'task_deadline', 'other'),
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
