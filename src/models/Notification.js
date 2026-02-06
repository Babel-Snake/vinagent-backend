const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Notification extends Model {
        static associate(models) {
            // Belongs to the user receiving the notification
            Notification.belongsTo(models.User, { foreignKey: 'userId' });
        }
    }

    Notification.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Users', key: 'id' }
            },
            type: {
                type: DataTypes.ENUM('MENTION', 'ASSIGNMENT', 'SYSTEM'),
                allowNull: false
            },
            message: {
                type: DataTypes.STRING,
                allowNull: false
            },
            isRead: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            data: {
                type: DataTypes.JSON,
                allowNull: true,
                comment: 'Stores context like { taskId: 123, actionId: 456 }'
            }
        },
        {
            sequelize,
            modelName: 'Notification',
            tableName: 'Notifications',
            timestamps: true
        }
    );

    return Notification;
};
