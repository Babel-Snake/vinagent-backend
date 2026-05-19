'use strict';

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
    const table = await queryInterface.describeTable(tableName);
    if (!table[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
}

async function removeColumnIfPresent(queryInterface, tableName, columnName) {
    const table = await queryInterface.describeTable(tableName);
    if (table[columnName]) {
        await queryInterface.removeColumn(tableName, columnName);
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'WineryIntegrationConfigs', 'posProvider', {
            type: Sequelize.STRING,
            defaultValue: 'other'
        });
        await addColumnIfMissing(queryInterface, 'WineryIntegrationConfigs', 'crmProvider', {
            type: Sequelize.STRING,
            defaultValue: 'other'
        });
        await addColumnIfMissing(queryInterface, 'WineryIntegrationConfigs', 'bookingProvider', {
            type: Sequelize.STRING,
            defaultValue: 'other'
        });
        await addColumnIfMissing(queryInterface, 'WineryIntegrationConfigs', 'deliveryProvider', {
            type: Sequelize.STRING,
            defaultValue: 'other'
        });
        await addColumnIfMissing(queryInterface, 'WineryIntegrationConfigs', 'providerConnections', {
            type: Sequelize.JSON,
            allowNull: true
        });
    },

    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'WineryIntegrationConfigs', 'providerConnections');
        await removeColumnIfPresent(queryInterface, 'WineryIntegrationConfigs', 'deliveryProvider');
        await removeColumnIfPresent(queryInterface, 'WineryIntegrationConfigs', 'bookingProvider');
        await removeColumnIfPresent(queryInterface, 'WineryIntegrationConfigs', 'crmProvider');
        await removeColumnIfPresent(queryInterface, 'WineryIntegrationConfigs', 'posProvider');
    }
};
