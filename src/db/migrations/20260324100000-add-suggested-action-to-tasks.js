'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Tasks', 'suggestedAction', {
            type: Sequelize.TEXT,
            allowNull: true
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('Tasks', 'suggestedAction');
    }
};
