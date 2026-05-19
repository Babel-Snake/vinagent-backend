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
                    'ACTIONED',
                    'REJECTED',
                    'EXECUTION_TRIGGERED',
                    'EXECUTION_RECORDED',
                    'UPDATED_PAYLOAD',
                    'NOTE_ADDED',
                    'MANUAL_CREATED',
                    'MANUAL_UPDATE',
                    'OUTCOME_RECORDED',
                    'MEMBER_ENRICHED',
                    'ASSIGNED',
                    'LINKED_TASK',
                    'STEP_CREATED',
                    'STEP_UPDATED',
                    'STEP_COMPLETED',
                    'STEP_DELETED',
                    'ATTACHMENT_ADDED',
                    'ATTACHMENT_DELETED'
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
