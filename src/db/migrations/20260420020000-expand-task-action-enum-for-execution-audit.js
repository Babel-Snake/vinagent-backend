'use strict';

const NEXT_VALUES = [
    'CREATED',
    'ACTIONED',
    'REJECTED',
    'EXECUTION_TRIGGERED',
    'EXECUTION_RECORDED',
    'UPDATED_PAYLOAD',
    'NOTE_ADDED',
    'MANUAL_CREATED',
    'MANUAL_UPDATE',
    'OUTCOME_RECORDED',
    'MEMBER_ENRICHED',
    'ASSIGNED',
    'LINKED_TASK',
    'STEP_CREATED',
    'STEP_UPDATED',
    'STEP_COMPLETED',
    'STEP_DELETED'
];

const PREVIOUS_VALUES = [
    'CREATED',
    'ACTIONED',
    'REJECTED',
    'EXECUTION_TRIGGERED',
    'UPDATED_PAYLOAD',
    'NOTE_ADDED',
    'MANUAL_CREATED',
    'MANUAL_UPDATE',
    'OUTCOME_RECORDED',
    'ASSIGNED',
    'LINKED_TASK',
    'STEP_CREATED',
    'STEP_UPDATED',
    'STEP_COMPLETED',
    'STEP_DELETED'
];

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query('ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;');
        await queryInterface.changeColumn('TaskActions', 'actionType', {
            type: Sequelize.ENUM(...NEXT_VALUES),
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query('ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;');
        await queryInterface.changeColumn('TaskActions', 'actionType', {
            type: Sequelize.ENUM(...PREVIOUS_VALUES),
            allowNull: false
        });
    }
};
