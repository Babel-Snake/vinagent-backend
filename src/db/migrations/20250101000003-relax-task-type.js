'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Change 'type' column from ENUM to STRING to allow new classification values
        await queryInterface.changeColumn('Tasks', 'type', {
            type: Sequelize.STRING,
            allowNull: true
        });
    },

    async down(queryInterface, Sequelize) {
        // Revert to ENUM (Warning: this might fail if column contains values not in ENUM)
        await queryInterface.changeColumn('Tasks', 'type', {
            type: Sequelize.ENUM(
                'GENERAL_QUERY',
                'ADDRESS_CHANGE',
                'PAYMENT_ISSUE',
                'BOOKING_REQUEST',
                'DELIVERY_ISSUE'
            ),
            allowNull: false
        });
    }
};
