const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Message extends Model {
        static associate(models) {
            Message.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            Message.belongsTo(models.Member, { foreignKey: 'memberId' });
            Message.hasMany(models.Task, { foreignKey: 'messageId' });
        }
    }

    Message.init(
        {
            source: {
                type: DataTypes.ENUM('sms', 'email', 'voice'),
                allowNull: false
            },
            direction: {
                type: DataTypes.ENUM('inbound', 'outbound'),
                allowNull: false
            },
            subject: { type: DataTypes.STRING, allowNull: true },
            body: { type: DataTypes.TEXT, allowNull: true },
            rawPayload: { type: DataTypes.JSON, allowNull: true },
            externalId: { type: DataTypes.STRING, allowNull: true },
            receivedAt: { type: DataTypes.DATE, allowNull: true },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' }
            },
            memberId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'Members', key: 'id' }
            }
        },
        {
            sequelize,
            modelName: 'Message',
            tableName: 'Messages',
            timestamps: true
        }
    );

    return Message;
};
