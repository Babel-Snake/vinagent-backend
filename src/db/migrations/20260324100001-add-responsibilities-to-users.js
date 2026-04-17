'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Users', 'responsibilities', {
            type: Sequelize.TEXT,
            allowNull: true
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('Users', 'responsibilities');
    }
};
