const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EmailSyncState extends Model {
        static associate(models) {
            EmailSyncState.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }

    EmailSyncState.init({
        wineryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Wineries', key: 'id' }
        },
        provider: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'outlook'
        },
        mailboxAddress: {
            type: DataTypes.STRING,
            allowNull: false
        },
        folderId: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'inbox'
        },
        lastSyncedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lastMessageReceivedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        deltaLink: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        lastError: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        isEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        syncStats: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'EmailSyncState',
        tableName: 'EmailSyncStates',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['wineryId', 'provider', 'mailboxAddress', 'folderId'],
                name: 'email_sync_state_unique_mailbox'
            }
        ]
    });

    return EmailSyncState;
};
