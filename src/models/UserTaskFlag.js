const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserTaskFlag extends Model {
        static associate(models) {
            UserTaskFlag.belongsTo(models.User, { foreignKey: 'userId' });
            UserTaskFlag.belongsTo(models.Task, { foreignKey: 'taskId' });
        }
    }

    UserTaskFlag.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
                references: { model: 'Users', key: 'id' }
            },
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
                references: { model: 'Tasks', key: 'id' }
            },
            label: {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Optional user-defined label'
            }
        },
        {
            sequelize,
            modelName: 'UserTaskFlag',
            tableName: 'UserTaskFlags',
            timestamps: true
        }
    );

    return UserTaskFlag;
};
