'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  return Boolean((await queryInterface.describeTable(tableName))[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'OperationalAreaProfiles'))) {
      await queryInterface.createTable('OperationalAreaProfiles', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        publicEmail: { type: Sequelize.STRING, allowNull: true },
        publicPhone: { type: Sequelize.STRING, allowNull: true },
        openingHoursText: { type: Sequelize.TEXT, allowNull: true },
        guestDirections: { type: Sequelize.TEXT, allowNull: true },
        serviceNotes: { type: Sequelize.TEXT, allowNull: true },
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
          unique: true,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalAreaProfiles', ['wineryId', 'areaId'], {
        name: 'area_profiles_winery_area'
      });
    }

    if (!(await hasTable(queryInterface, 'OperationalAreaBookingsConfigs'))) {
      await queryInterface.createTable('OperationalAreaBookingsConfigs', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        walkInsAllowed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        walkInNotes: { type: Sequelize.TEXT, allowNull: true },
        groupBookingThreshold: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
        leadTimeHours: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 24 },
        cancellationPolicyText: { type: Sequelize.TEXT, allowNull: true },
        kidsPolicy: { type: Sequelize.TEXT, allowNull: true },
        petsPolicy: { type: Sequelize.TEXT, allowNull: true },
        defaultResponseStrategy: {
          type: Sequelize.ENUM('confirm', 'create_task'),
          allowNull: false,
          defaultValue: 'create_task'
        },
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
          unique: true,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalAreaBookingsConfigs', ['wineryId', 'areaId'], {
        name: 'area_bookings_winery_area'
      });
    }

    if (!(await hasColumn(queryInterface, 'WineryBookingTypes', 'areaId'))) {
      await queryInterface.addColumn('WineryBookingTypes', 'areaId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        after: 'wineryId'
      });
      await queryInterface.addIndex('WineryBookingTypes', ['wineryId', 'areaId', 'isActive'], {
        name: 'booking_types_winery_area_active'
      });
    }
  },

  async down(queryInterface) {
    if (await hasColumn(queryInterface, 'WineryBookingTypes', 'areaId')) {
      await queryInterface.removeColumn('WineryBookingTypes', 'areaId');
    }
    if (await hasTable(queryInterface, 'OperationalAreaBookingsConfigs')) {
      await queryInterface.dropTable('OperationalAreaBookingsConfigs');
    }
    if (await hasTable(queryInterface, 'OperationalAreaProfiles')) {
      await queryInterface.dropTable('OperationalAreaProfiles');
    }
  }
};
