'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  const columns = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(columns, columnName);
}

async function hasIndex(queryInterface, tableName, indexName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  return (await queryInterface.showIndex(tableName)).some(index => index.name === indexName);
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  if (!(await hasColumn(queryInterface, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfPresent(queryInterface, tableName, columnName) {
  if (await hasColumn(queryInterface, tableName, columnName)) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'ProjectionIssues', 'acknowledgedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'ProjectionIssues', 'acknowledgedBy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, 'ProjectionIssues', 'resolutionMethod', {
      type: Sequelize.STRING(80),
      allowNull: true
    });
    if (!(await hasIndex(queryInterface, 'ProjectionIssues', 'projection_issues_acknowledgement'))) {
      await queryInterface.addIndex(
        'ProjectionIssues',
        ['wineryId', 'acknowledgedBy', 'acknowledgedAt'],
        { name: 'projection_issues_acknowledgement' }
      );
    }
  },

  async down(queryInterface) {
    if (await hasIndex(queryInterface, 'ProjectionIssues', 'projection_issues_acknowledgement')) {
      await queryInterface.removeIndex('ProjectionIssues', 'projection_issues_acknowledgement');
    }
    await removeColumnIfPresent(queryInterface, 'ProjectionIssues', 'resolutionMethod');
    await removeColumnIfPresent(queryInterface, 'ProjectionIssues', 'acknowledgedBy');
    await removeColumnIfPresent(queryInterface, 'ProjectionIssues', 'acknowledgedAt');
  }
};
