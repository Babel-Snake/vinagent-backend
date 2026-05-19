'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Tasks', 'resolvedAs', {
            type: Sequelize.ENUM('COMPLETED', 'WORKAROUND', 'ESCALATED', 'DECLINED', 'DUPLICATE', 'NO_ACTION'),
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'resolutionType', {
            type: Sequelize.ENUM(
                'EXECUTED',
                'REPLIED',
                'MANUAL_WORKAROUND',
                'POLICY_DECLINE',
                'CUSTOMER_NO_RESPONSE',
                'NO_ACTION_NEEDED',
                'SPAM_OR_INVALID',
                'EXTERNAL_ESCALATION',
                'INTERNAL_ESCALATION',
                'MERGED_DUPLICATE',
                'ALREADY_RESOLVED',
                'INFO_ONLY'
            ),
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'customerOutcome', {
            type: Sequelize.ENUM(
                'BOOKING_CONFIRMED',
                'ORDER_UPDATED',
                'ACCOUNT_UPDATED',
                'INFO_PROVIDED',
                'ISSUE_RESOLVED',
                'REQUEST_DECLINED',
                'REFERRED',
                'NO_CHANGE',
                'UNKNOWN'
            ),
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'followUpRequired', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        await queryInterface.addColumn('Tasks', 'followUpDueAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'followUpSummary', {
            type: Sequelize.TEXT,
            allowNull: true
        });

        await queryInterface.sequelize.query('ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;');
        await queryInterface.changeColumn('TaskActions', 'actionType', {
            type: Sequelize.ENUM(
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
            ),
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query('ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;');
        await queryInterface.changeColumn('TaskActions', 'actionType', {
            type: Sequelize.ENUM(
                'CREATED',
                'ACTIONED',
                'REJECTED',
                'EXECUTION_TRIGGERED',
                'UPDATED_PAYLOAD',
                'NOTE_ADDED',
                'MANUAL_CREATED',
                'MANUAL_UPDATE',
                'ASSIGNED',
                'LINKED_TASK',
                'STEP_CREATED',
                'STEP_UPDATED',
                'STEP_COMPLETED',
                'STEP_DELETED'
            ),
            allowNull: false
        });

        await queryInterface.removeColumn('Tasks', 'followUpSummary');
        await queryInterface.removeColumn('Tasks', 'followUpDueAt');
        await queryInterface.removeColumn('Tasks', 'followUpRequired');
        await queryInterface.removeColumn('Tasks', 'customerOutcome');
        await queryInterface.removeColumn('Tasks', 'resolutionType');
        await queryInterface.removeColumn('Tasks', 'resolvedAs');
    }
};
