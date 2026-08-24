const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Message extends Model {
        static associate(models) {
            Message.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            Message.belongsTo(models.Member, { foreignKey: 'memberId' });
            Message.belongsTo(models.Task, { foreignKey: 'taskId' });
            Message.belongsTo(models.ExternalResourceReference, {
                foreignKey: 'primarySourceReferenceId',
                as: 'PrimarySourceReference'
            });
            Message.hasMany(models.Task, { foreignKey: 'messageId' });
            Message.hasMany(models.MessageDeliveryEvent, { foreignKey: 'messageId', as: 'DeliveryEvents' });
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
            primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: true },
            canonicalDeliveryStatus: {
                type: DataTypes.STRING(40),
                allowNull: false,
                defaultValue: 'UNKNOWN'
            },
            deliveryStatusOccurredAt: { type: DataTypes.DATE, allowNull: true },
            deliveryFailureCategory: {
                type: DataTypes.STRING(40),
                allowNull: false,
                defaultValue: 'NONE'
            },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' }
            },
            memberId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'Members', key: 'id' }
            },
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'Tasks', key: 'id' }
            }
        },
        {
            sequelize,
            modelName: 'Message',
            tableName: 'Messages',
            timestamps: true,
            indexes: [
                {
                    name: 'messages_winery_source_external_id_unique',
                    unique: true,
                    fields: ['wineryId', 'source', 'externalId']
                },
                {
                    name: 'messages_unique_primary_source',
                    unique: true,
                    fields: ['primarySourceReferenceId']
                },
                {
                    name: 'messages_delivery_attention',
                    fields: ['wineryId', 'canonicalDeliveryStatus', 'deliveryStatusOccurredAt']
                }
            ]
        }
    );

    return Message;
};
