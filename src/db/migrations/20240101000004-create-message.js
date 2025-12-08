'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Messages', {
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
                onDelete: 'CASCADE'
            },
            memberId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Members', key: 'id' },
                onDelete: 'SET NULL'
            },
            source: {
                type: Sequelize.ENUM('sms', 'email', 'voice'),
                allowNull: false
            },
            direction: {
                type: Sequelize.ENUM('inbound', 'outbound'),
                allowNull: false
            },
            subject: { type: Sequelize.STRING, allowNull: true },
            body: { type: Sequelize.TEXT, allowNull: true },
            rawPayload: { type: Sequelize.JSON, allowNull: true },
            externalId: { type: Sequelize.STRING, allowNull: true },
            receivedAt: { type: Sequelize.DATE, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Messages');
    }
};
