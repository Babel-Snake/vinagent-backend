const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TaskStep extends Model {
        static associate(models) {
            TaskStep.belongsTo(models.Task, { foreignKey: 'taskId' });
            TaskStep.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'Owner' });
        }
    }

    TaskStep.init(
        {
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Tasks', key: 'id' }
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            stepType: {
                type: DataTypes.ENUM(
                    'INTERNAL',
                    'CUSTOMER_MESSAGE',
                    'CUSTOMER_WAIT',
                    'APPROVAL',
                    'EXTERNAL',
                    'EXECUTION',
                    'FOLLOW_UP',
                    'OTHER'
                ),
                allowNull: false,
                defaultValue: 'INTERNAL'
            },
            status: {
                type: DataTypes.ENUM(
                    'PENDING',
                    'IN_PROGRESS',
                    'BLOCKED',
                    'COMPLETED',
                    'SKIPPED',
                    'CANCELLED'
                ),
                allowNull: false,
                defaultValue: 'PENDING'
            },
            waitingOn: {
                type: DataTypes.ENUM('NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'),
                allowNull: false,
                defaultValue: 'NONE'
            },
            sortOrder: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            ownerUserId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' }
            },
            dueAt: {
                type: DataTypes.DATE,
                allowNull: true
            },
            blockedReason: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            completionNotes: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            completedAt: {
                type: DataTypes.DATE,
                allowNull: true
            },
            metadata: {
                type: DataTypes.JSON,
                allowNull: true
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
            modelName: 'TaskStep',
            tableName: 'TaskSteps',
            timestamps: true
        }
    );

    return TaskStep;
};
