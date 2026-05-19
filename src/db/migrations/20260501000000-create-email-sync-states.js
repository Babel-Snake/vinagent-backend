'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('EmailSyncStates', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            provider: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'outlook'
            },
            mailboxAddress: {
                type: Sequelize.STRING,
                allowNull: false
            },
            folderId: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'inbox'
            },
            lastSyncedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            lastMessageReceivedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            deltaLink: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            lastError: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            isEnabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            syncStats: {
                type: Sequelize.JSON,
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.addIndex('EmailSyncStates', ['wineryId', 'provider', 'mailboxAddress', 'folderId'], {
            unique: true,
            name: 'email_sync_state_unique_mailbox'
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('EmailSyncStates');
    }
};
