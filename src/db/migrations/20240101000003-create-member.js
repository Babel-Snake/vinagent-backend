'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Members', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onDelete: 'CASCADE'
            },
            firstName: { type: Sequelize.STRING, allowNull: false },
            lastName: { type: Sequelize.STRING, allowNull: false },
            email: { type: Sequelize.STRING, allowNull: true },
            phone: { type: Sequelize.STRING, allowNull: true },
            addressLine1: { type: Sequelize.STRING, allowNull: true },
            addressLine2: { type: Sequelize.STRING, allowNull: true },
            suburb: { type: Sequelize.STRING, allowNull: true },
            state: { type: Sequelize.STRING, allowNull: true },
            postcode: { type: Sequelize.STRING, allowNull: true },
            country: { type: Sequelize.STRING, allowNull: true, defaultValue: 'Australia' },
            notes: { type: Sequelize.TEXT, allowNull: true },
            externalRef: { type: Sequelize.STRING, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Members');
    }
};
