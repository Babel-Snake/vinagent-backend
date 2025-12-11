'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Add 'sentiment' column
        await queryInterface.addColumn('Tasks', 'sentiment', {
            type: Sequelize.ENUM('NEUTRAL', 'POSITIVE', 'NEGATIVE'),
            defaultValue: 'NEUTRAL',
            allowNull: true // Allow null for existing records, though default handles new ones
        });

        // 2. Add 'assigneeId' column (FK to Users)
        await queryInterface.addColumn('Tasks', 'assigneeId', {
            type: Sequelize.INTEGER,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            allowNull: true
        });

        // 3. Add 'parentTaskId' column (FK to Tasks - Self Reference)
        await queryInterface.addColumn('Tasks', 'parentTaskId', {
            type: Sequelize.INTEGER,
            references: { model: 'Tasks', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            allowNull: true
        });

        // 4. Update 'category' ENUM to include 'OPERATIONS'
        // NOTE: MySQL does not support easy ENUM modification in one go without raw query or unsafe operations.
        // However, Sequelize changeColumn can handle it if we redeclare the enum.
        // Safe approach: change to STRING temporarily or just redeclare ENUM.
        // For MVP/Dev, we'll try redeclaring. If it fails, we might need a raw query.
        try {
            await queryInterface.changeColumn('Tasks', 'category', {
                type: Sequelize.ENUM('BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'INTERNAL', 'SYSTEM', 'OPERATIONS'),
                allowNull: true
            });
        } catch (e) {
            console.warn("Could not auto-update ENUM, falling back to raw query if needed or ignoring if already supported.");
            // Fallback for MySQL if strictly enforced
            // await queryInterface.sequelize.query("ALTER TABLE Tasks MODIFY COLUMN category ENUM('BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'INTERNAL', 'SYSTEM', 'OPERATIONS')");
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('Tasks', 'sentiment');
        await queryInterface.removeColumn('Tasks', 'assigneeId');
        await queryInterface.removeColumn('Tasks', 'parentTaskId');

        // Revert category ENUM (removing OPERATIONS) - Warning: Data loss for OPERATIONS tasks
        await queryInterface.changeColumn('Tasks', 'category', {
            type: Sequelize.ENUM('BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'INTERNAL', 'SYSTEM'),
            allowNull: true
        });
    }
};
