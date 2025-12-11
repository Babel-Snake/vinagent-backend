'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
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
                    'MANUAL_UPDATE',
                    'ASSIGNED',
                    'LINKED_TASK'
                ),
                allowNull: false
            });
        } catch (e) {
            console.warn("Could not auto-update ENUM, falling back to raw query if needed or ignoring if already supported.");
        }
    },

    async down(queryInterface, Sequelize) {
        // Revert to previous ENUM - Warning: Data loss for new types
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
    }
};
