'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Update Wineries Table
        await queryInterface.addColumn('Wineries', 'website', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await queryInterface.addColumn('Wineries', 'openingHours', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('Wineries', 'socialLinks', {
            type: Sequelize.JSON,
            allowNull: true
        });

        // 2. Create WineryProducts Table
        await queryInterface.createTable('WineryProducts', {
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
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            category: {
                type: Sequelize.STRING, // e.g., 'Red', 'White'
                allowNull: true
            },
            price: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true
            },
            stockStatus: {
                type: Sequelize.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'),
                defaultValue: 'IN_STOCK'
            },
            tastingNotes: {
                type: Sequelize.TEXT,
                allowNull: true
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

        // 3. Create WineryPolicies Table
        await queryInterface.createTable('WineryPolicies', {
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
            section: { // e.g., 'shipping', 'access', 'booking'
                type: Sequelize.STRING,
                allowNull: false
            },
            question: { // Or 'Header'
                type: Sequelize.STRING,
                allowNull: false
            },
            answer: { // The policy text
                type: Sequelize.TEXT,
                allowNull: false
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

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('WineryPolicies');
        await queryInterface.dropTable('WineryProducts');
        await queryInterface.removeColumn('Wineries', 'socialLinks');
        await queryInterface.removeColumn('Wineries', 'openingHours');
        await queryInterface.removeColumn('Wineries', 'website');
    }
};
