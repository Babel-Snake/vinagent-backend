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
    if (!(await hasTable(queryInterface, 'IntegrationProviderScheduleStates'))) {
      await queryInterface.createTable('IntegrationProviderScheduleStates', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        domain: { type: Sequelize.STRING(80), allowNull: false },
        providerKey: { type: Sequelize.STRING(120), allowNull: false },
        nextPermitAt: { type: Sequelize.DATE, allowNull: true },
        rateWindowStartedAt: { type: Sequelize.DATE, allowNull: true },
        rateWindowScheduledCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastScheduledAt: { type: Sequelize.DATE, allowNull: true },
        lastConnectionId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        lastJobKind: { type: Sequelize.STRING(120), allowNull: true },
        scheduledCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(
      queryInterface,
      'IntegrationProviderScheduleStates',
      ['domain', 'providerKey'],
      { unique: true, name: 'integration_provider_schedule_states_unique' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationProviderScheduleStates',
      ['nextPermitAt'],
      { name: 'integration_provider_schedule_states_due' }
    );
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationProviderScheduleStates')) {
      await queryInterface.dropTable('IntegrationProviderScheduleStates');
    }
  }
};
