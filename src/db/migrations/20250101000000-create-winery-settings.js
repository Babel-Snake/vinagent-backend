'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('WinerySettings', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Wineries',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            tier: {
                type: Sequelize.ENUM('BASIC', 'ADVANCED'),
                defaultValue: 'BASIC'
            },
            enableBookingModule: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            enableWineClubModule: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            enableOrdersModule: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            enableSecureLinks: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            enableInsights: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            enableVoice: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        // Add unique constraint separately to ensure one settings row per winery
        await queryInterface.addConstraint('WinerySettings', {
            fields: ['wineryId'],
            type: 'unique',
            name: 'unique_winery_settings'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('WinerySettings');
    }
};
