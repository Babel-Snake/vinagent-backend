'use strict';

async function hasTable(queryInterface, tableName) {
  const expectedName = String(tableName).toLowerCase();
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expectedName;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  const columns = await queryInterface.describeTable(tableName);
  return Boolean(columns[columnName]);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const expectedName = String(indexName).toLowerCase();
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some(index => String(index.name).toLowerCase() === expectedName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'Notices'))) return;

    if (!(await hasColumn(queryInterface, 'Notices', 'externalSource'))) {
      await queryInterface.addColumn('Notices', 'externalSource', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'archivedAt'
      });
    }
    if (!(await hasColumn(queryInterface, 'Notices', 'externalId'))) {
      await queryInterface.addColumn('Notices', 'externalId', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'externalSource'
      });
    }
    if (!(await hasColumn(queryInterface, 'Notices', 'externalPostedAt'))) {
      await queryInterface.addColumn('Notices', 'externalPostedAt', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'externalId'
      });
    }
    if (!(await hasColumn(queryInterface, 'Notices', 'externalAuthorName'))) {
      await queryInterface.addColumn('Notices', 'externalAuthorName', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'externalPostedAt'
      });
    }
    if (!(await hasColumn(queryInterface, 'Notices', 'sourceEventId'))) {
      await queryInterface.addColumn('Notices', 'sourceEventId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'IntegrationEvents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        after: 'externalAuthorName'
      });
    }

    if (!(await hasIndex(queryInterface, 'Notices', 'notices_winery_external_source_id'))) {
      await queryInterface.addIndex('Notices', ['wineryId', 'externalSource', 'externalId'], {
        name: 'notices_winery_external_source_id'
      });
    }
    if (!(await hasIndex(queryInterface, 'Notices', 'notices_source_event'))) {
      await queryInterface.addIndex('Notices', ['sourceEventId'], {
        name: 'notices_source_event'
      });
    }
  },

  // The original integration-event migration owns removal of these columns.
  // A repair rollback is intentionally non-destructive because some databases
  // already had some or all of the repaired schema before this migration ran.
  async down() {}
};
