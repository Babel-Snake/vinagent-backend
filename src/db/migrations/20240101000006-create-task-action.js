'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TaskActions', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            taskId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Tasks', key: 'id' },
                onDelete: 'CASCADE'
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' },
                onDelete: 'SET NULL'
            },
            actionType: {
                type: Sequelize.ENUM(
                    'CREATED',
                    'APPROVED',
                    'REJECTED',
                    'EXECUTION_TRIGGERED',
                    'EXECUTED',
                    'UPDATED_PAYLOAD',
                    'NOTE_ADDED'
                ),
                allowNull: false
            },
            details: { type: Sequelize.JSON, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('TaskActions');
    }
};
