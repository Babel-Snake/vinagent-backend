'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Tasks', 'suggestedRecipientEmail', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await queryInterface.addColumn('Tasks', 'suggestedCc', {
            type: Sequelize.STRING,
            allowNull: true
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('Tasks', 'suggestedRecipientEmail');
        await queryInterface.removeColumn('Tasks', 'suggestedCc');
    }
};
