'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Tasks', {
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
            messageId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Messages', key: 'id' },
                onDelete: 'SET NULL'
            },
            createdBy: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' },
                onDelete: 'SET NULL'
            },
            updatedBy: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' },
                onDelete: 'SET NULL'
            },
            type: {
                type: Sequelize.ENUM(
                    'GENERAL_QUERY',
                    'ADDRESS_CHANGE',
                    'PAYMENT_ISSUE',
                    'BOOKING_REQUEST',
                    'DELIVERY_ISSUE'
                ),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM(
                    'PENDING_REVIEW',
                    'APPROVED',
                    'AWAITING_MEMBER_ACTION',
                    'REJECTED',
                    'EXECUTED',
                    'CANCELLED'
                ),
                allowNull: false,
                defaultValue: 'PENDING_REVIEW'
            },
            payload: { type: Sequelize.JSON, allowNull: true },
            suggestedChannel: { type: Sequelize.ENUM('sms', 'email', 'voice', 'none'), allowNull: true },
            suggestedReplySubject: { type: Sequelize.STRING, allowNull: true },
            suggestedReplyBody: { type: Sequelize.TEXT, allowNull: true },
            requiresApproval: { type: Sequelize.BOOLEAN, defaultValue: true },
            priority: {
                type: Sequelize.ENUM('low', 'normal', 'high'),
                defaultValue: 'normal'
            },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Tasks');
    }
};
