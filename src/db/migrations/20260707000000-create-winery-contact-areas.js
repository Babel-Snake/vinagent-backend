'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'WineryContactAreas')) return;

    await queryInterface.createTable('WineryContactAreas', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      relationshipType: {
        type: Sequelize.ENUM('PRIMARY', 'LINKED'),
        allowNull: false,
        defaultValue: 'LINKED'
      },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contactId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'WineryContacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      areaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addIndex('WineryContactAreas', ['contactId', 'areaId'], {
      unique: true,
      name: 'winery_contact_areas_contact_area_unique'
    });
    await queryInterface.addIndex('WineryContactAreas', ['wineryId', 'areaId', 'contactId'], {
      name: 'winery_contact_areas_winery_area_contact'
    });
    await queryInterface.addIndex('WineryContactAreas', ['contactId', 'relationshipType'], {
      name: 'winery_contact_areas_contact_relationship'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'WineryContactAreas')) {
      await queryInterface.dropTable('WineryContactAreas');
    }
  }
};
