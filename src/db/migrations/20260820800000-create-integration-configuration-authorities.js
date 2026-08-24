'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  return (await queryInterface.showIndex(tableName)).some(index => index.name === indexName);
}

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await hasIndex(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'IntegrationConfigurationAuthorities'))) {
      await queryInterface.createTable('IntegrationConfigurationAuthorities', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        domain: { type: Sequelize.STRING(80), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'LEGACY_PRIMARY' },
        preparedAt: { type: Sequelize.DATE, allowNull: true },
        preparedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        activatedAt: { type: Sequelize.DATE, allowNull: true },
        activatedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        rolledBackAt: { type: Sequelize.DATE, allowNull: true },
        rolledBackBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        lastTransitionReason: { type: Sequelize.TEXT, allowNull: true },
        previewHash: { type: Sequelize.STRING(64), allowNull: true },
        readinessSnapshot: { type: Sequelize.JSON, allowNull: true },
        legacySnapshot: { type: Sequelize.JSON, allowNull: true },
        canonicalSnapshot: { type: Sequelize.JSON, allowNull: true },
        lastProjectedAt: { type: Sequelize.DATE, allowNull: true },
        lockVersion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(
      queryInterface,
      'IntegrationConfigurationAuthorities',
      ['wineryId', 'domain'],
      { unique: true, name: 'integration_configuration_authorities_unique' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationConfigurationAuthorities',
      ['wineryId', 'status'],
      { name: 'integration_configuration_authorities_status' }
    );
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationConfigurationAuthorities')) {
      await queryInterface.dropTable('IntegrationConfigurationAuthorities');
    }
  }
};
