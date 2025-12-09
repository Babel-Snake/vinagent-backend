'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Add new classification columns
        await queryInterface.addColumn('Tasks', 'category', {
            type: Sequelize.ENUM('BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'INTERNAL', 'SYSTEM'),
            allowNull: true // Allow null initially for migration, but logic should enforce it
        });

        await queryInterface.addColumn('Tasks', 'subType', {
            type: Sequelize.STRING, // Using STRING for flexibility, logic validates against allowed values
            allowNull: true
        });

        await queryInterface.addColumn('Tasks', 'customerType', {
            type: Sequelize.ENUM('MEMBER', 'VISITOR', 'UNKNOWN'),
            allowNull: false,
            defaultValue: 'UNKNOWN'
        });

        // NOTE: We are keeping 'type' for now to prevent data loss, but it is deprecated.
        // In a real production migration, we would run a script here to map old 'type' values to new fields.
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('Tasks', 'category');
        await queryInterface.removeColumn('Tasks', 'subType');
        await queryInterface.removeColumn('Tasks', 'customerType');
    }
};
