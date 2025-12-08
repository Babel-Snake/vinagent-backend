'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Users', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            firebaseUid: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            email: {
                type: Sequelize.STRING,
                allowNull: false
            },
            displayName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            role: {
                type: Sequelize.ENUM('admin', 'manager', 'staff'),
                allowNull: false,
                defaultValue: 'staff'
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Wineries',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
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
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Users');
    }
};
