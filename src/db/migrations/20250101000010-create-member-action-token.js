'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('MemberActionTokens', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            memberId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Members', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            taskId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Tasks', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            type: {
                type: Sequelize.ENUM('ADDRESS_CHANGE', 'PAYMENT_METHOD_UPDATE', 'PREFERENCE_UPDATE'),
                allowNull: false
            },
            channel: {
                type: Sequelize.ENUM('sms', 'email', 'voice'),
                allowNull: false,
                defaultValue: 'sms'
            },
            token: {
                type: Sequelize.STRING(64),
                allowNull: false,
                unique: true
            },
            target: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            payload: {
                type: Sequelize.JSON,
                allowNull: true
            },
            expiresAt: {
                type: Sequelize.DATE,
                allowNull: false
            },
            usedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // Indexes for lookup
        await queryInterface.addIndex('MemberActionTokens', ['token']);
        await queryInterface.addIndex('MemberActionTokens', ['memberId']);
        await queryInterface.addIndex('MemberActionTokens', ['taskId']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('MemberActionTokens');
    }
};
