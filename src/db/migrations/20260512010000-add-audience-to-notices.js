'use strict';

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'Notices', 'audienceType'))) {
      await queryInterface.addColumn('Notices', 'audienceType', {
        type: Sequelize.ENUM('all_staff', 'roles', 'users'),
        allowNull: false,
        defaultValue: 'all_staff',
        after: 'isPinned'
      });
    }

    if (!(await hasColumn(queryInterface, 'Notices', 'audienceRoles'))) {
      await queryInterface.addColumn('Notices', 'audienceRoles', {
        type: Sequelize.JSON,
        allowNull: true,
        after: 'audienceType'
      });
    }

    if (!(await hasColumn(queryInterface, 'Notices', 'audienceUserIds'))) {
      await queryInterface.addColumn('Notices', 'audienceUserIds', {
        type: Sequelize.JSON,
        allowNull: true,
        after: 'audienceRoles'
      });
    }

    if (!(await hasIndex(queryInterface, 'Notices', 'idx_notices_winery_audience_type'))) {
      await queryInterface.addIndex('Notices', ['wineryId', 'audienceType'], {
        name: 'idx_notices_winery_audience_type'
      });
    }
  },

  async down(queryInterface) {
    if (await hasIndex(queryInterface, 'Notices', 'idx_notices_winery_audience_type')) {
      await queryInterface.removeIndex('Notices', 'idx_notices_winery_audience_type');
    }

    if (await hasColumn(queryInterface, 'Notices', 'audienceUserIds')) {
      await queryInterface.removeColumn('Notices', 'audienceUserIds');
    }

    if (await hasColumn(queryInterface, 'Notices', 'audienceRoles')) {
      await queryInterface.removeColumn('Notices', 'audienceRoles');
    }

    if (await hasColumn(queryInterface, 'Notices', 'audienceType')) {
      await queryInterface.removeColumn('Notices', 'audienceType');
    }
  }
};
