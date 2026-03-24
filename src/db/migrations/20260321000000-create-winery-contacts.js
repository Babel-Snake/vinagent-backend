'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('WineryContacts', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            name: { type: Sequelize.STRING, allowNull: false },
            role: { type: Sequelize.STRING, allowNull: false }, // e.g., 'Winemaker', 'Tasting Room Manager'
            email: { type: Sequelize.STRING },
            phone: { type: Sequelize.STRING },
            layer: { type: Sequelize.STRING }, // e.g., 'Management', 'Operations'
            notes: { type: Sequelize.TEXT },
            isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('WineryContacts');
    }
};
