const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            User.hasMany(models.Notification, { foreignKey: 'userId' });
            User.hasMany(models.TaskAction, { foreignKey: 'userId' });
            User.hasMany(models.TaskStep, { foreignKey: 'ownerUserId', as: 'OwnedTaskSteps' });
            User.hasMany(models.Notice, { foreignKey: 'createdBy', as: 'AuthoredNotices' });
            User.hasMany(models.NoticeTask, { foreignKey: 'createdBy', as: 'CreatedNoticeTaskLinks' });
            User.hasMany(models.NoticeComment, { foreignKey: 'userId', as: 'NoticeComments' });
        }
    }

    User.init(
        {
            firebaseUid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            email: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: {
                    isEmail: true
                }
            },
            displayName: {
                type: DataTypes.STRING,
                allowNull: true
            },
            isActive: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            role: {
                type: DataTypes.ENUM('admin', 'manager', 'staff'),
                allowNull: false,
                defaultValue: 'staff'
            },
            responsibilities: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            pinHash: {
                type: DataTypes.STRING,
                allowNull: true
            },
            pinUpdatedAt: {
                type: DataTypes.DATE,
                allowNull: true
            },
            pinFailedAttempts: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            pinLockedUntil: {
                type: DataTypes.DATE,
                allowNull: true
            },
            pinLastLoginAt: {
                type: DataTypes.DATE,
                allowNull: true
            },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Wineries',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            }
        },
        {
            sequelize,
            modelName: 'User',
            tableName: 'Users',
            timestamps: true
        }
    );
    return User;
};
