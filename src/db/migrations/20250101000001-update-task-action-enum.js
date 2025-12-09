'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // In MySQL, we can just modify the column to the new ENUM definition
        await queryInterface.changeColumn('TaskActions', 'actionType', {
            type: Sequelize.ENUM(
                'CREATED',
                'APPROVED',
                'REJECTED',
                'EXECUTION_TRIGGERED',
                'EXECUTED',
                'UPDATED_PAYLOAD',
                'NOTE_ADDED',
                'MANUAL_CREATED',
                'MANUAL_UPDATE'
            ),
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        // Revert to original ENUM
        await queryInterface.changeColumn('TaskActions', 'actionType', {
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
        });
    }
};
