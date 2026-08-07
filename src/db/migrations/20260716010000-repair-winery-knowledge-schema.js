'use strict';

async function describeTable(queryInterface, tableName) {
    try {
        return await queryInterface.describeTable(tableName);
    } catch {
        return null;
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        let sopTable = await describeTable(queryInterface, 'WinerySops');
        if (!sopTable) {
            await queryInterface.createTable('WinerySops', {
                id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
                wineryId: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'Wineries', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                areaId: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'OperationalAreas', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                title: { type: Sequelize.STRING, allowNull: false },
                body: { type: Sequelize.TEXT, allowNull: false },
                isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                createdAt: { allowNull: false, type: Sequelize.DATE },
                updatedAt: { allowNull: false, type: Sequelize.DATE }
            });
            sopTable = await describeTable(queryInterface, 'WinerySops');
        }

        if (sopTable && !sopTable.areaId) {
            await queryInterface.addColumn('WinerySops', 'areaId', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'OperationalAreas', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        }

        const sopIndexes = new Set((await queryInterface.showIndex('WinerySops')).map(index => index.name));
        if (!sopIndexes.has('winerysops_winery_area_active')) {
            await queryInterface.addIndex('WinerySops', ['wineryId', 'areaId', 'isActive'], {
                name: 'winerysops_winery_area_active'
            });
        }

        const faqTable = await describeTable(queryInterface, 'WineryFAQItems');
        if (faqTable?.section) {
            await queryInterface.changeColumn('WineryFAQItems', 'section', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
    },

    async down() {
        // Compatibility repair: preserve existing knowledge records during partial rollback.
        // The original winery-module rollback removes these tables during a full rollback.
    }
};
