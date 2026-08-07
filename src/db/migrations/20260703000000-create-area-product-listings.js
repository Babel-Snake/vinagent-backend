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
    if (await hasTable(queryInterface, 'AreaProductListings')) return;

    await queryInterface.createTable('AreaProductListings', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      isAvailable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      priceOverride: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      stockStatusOverride: {
        type: Sequelize.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'),
        allowNull: true
      },
      isFeatured: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      salesNotes: { type: Sequelize.TEXT, allowNull: true },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
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
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'WineryProducts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addIndex('AreaProductListings', ['areaId', 'productId'], {
      unique: true,
      name: 'area_product_listings_area_product_unique'
    });
    await queryInterface.addIndex('AreaProductListings', ['wineryId', 'areaId', 'isAvailable'], {
      name: 'area_product_listings_winery_area_available'
    });
    await queryInterface.addIndex('AreaProductListings', ['wineryId', 'productId'], {
      name: 'area_product_listings_winery_product'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'AreaProductListings')) {
      await queryInterface.dropTable('AreaProductListings');
    }
  }
};
