const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TaskAction extends Model {
        static associate(models) {
            TaskAction.belongsTo(models.Task, { foreignKey: 'taskId' });
            TaskAction.belongsTo(models.User, { foreignKey: 'userId' });
        }
    }

    TaskAction.init(
        {
            actionType: {
                type: DataTypes.ENUM(
                    'CREATED',
                    'APPROVED',
                    'REJECTED',
                    'EXECUTION_TRIGGERED',
                    'EXECUTED',
                    'UPDATED_PAYLOAD',
                    'NOTE_ADDED'
                ),
                allowNull: false
            },
            details: {
                type: DataTypes.JSON,
                allowNull: true
            },
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Tasks', key: 'id' }
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' }
            }
        },
        {
            sequelize,
            modelName: 'TaskAction',
            tableName: 'TaskActions',
            timestamps: true
        }
    );

    return TaskAction;
};
