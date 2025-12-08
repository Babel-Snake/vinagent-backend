'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Wineries', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            region: {
                type: Sequelize.STRING,
                allowNull: true
            },
            contactEmail: {
                type: Sequelize.STRING,
                allowNull: true
            },
            contactPhone: {
                type: Sequelize.STRING,
                allowNull: true
            },
            brandVoiceConfig: {
                type: Sequelize.JSON,
                allowNull: true
            },
            timeZone: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'Australia/Adelaide'
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
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Wineries');
    }
};
