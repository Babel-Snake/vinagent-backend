'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Tasks', 'workflowState', {
            type: Sequelize.ENUM('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED'),
            allowNull: false,
            defaultValue: 'NOT_STARTED'
        });

        await queryInterface.addColumn('Tasks', 'waitingOn', {
            type: Sequelize.ENUM('NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'),
            allowNull: false,
            defaultValue: 'NONE'
        });

        await queryInterface.addColumn('Tasks', 'nextStepSummary', {
            type: Sequelize.STRING,
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'blockedReason', {
            type: Sequelize.TEXT,
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'dueAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'resolutionSummary', {
            type: Sequelize.TEXT,
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'resolvedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.createTable('TaskSteps', {
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
            title: {
                type: Sequelize.STRING,
                allowNull: false
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            stepType: {
                type: Sequelize.ENUM('INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'),
                allowNull: false,
                defaultValue: 'INTERNAL'
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED'),
                allowNull: false,
                defaultValue: 'PENDING'
            },
            waitingOn: {
                type: Sequelize.ENUM('NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'),
                allowNull: false,
                defaultValue: 'NONE'
            },
            sortOrder: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            ownerUserId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Users', key: 'id' },
                onDelete: 'SET NULL'
            },
            dueAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            blockedReason: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            completionNotes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            completedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            metadata: {
                type: Sequelize.JSON,
                allowNull: true
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
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.sequelize.query(`ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;`);
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
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;`);
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
                'LINKED_TASK'
            ),
            allowNull: false
        });

        await queryInterface.dropTable('TaskSteps');
        await queryInterface.removeColumn('Tasks', 'resolvedAt');
        await queryInterface.removeColumn('Tasks', 'resolutionSummary');
        await queryInterface.removeColumn('Tasks', 'dueAt');
        await queryInterface.removeColumn('Tasks', 'blockedReason');
        await queryInterface.removeColumn('Tasks', 'nextStepSummary');
        await queryInterface.removeColumn('Tasks', 'waitingOn');
        await queryInterface.removeColumn('Tasks', 'workflowState');
    }
};
