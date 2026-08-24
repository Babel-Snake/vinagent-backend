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
    if (!(await hasTable(queryInterface, 'AutomationResourceBindings'))) {
      await queryInterface.createTable('AutomationResourceBindings', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        ruleId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'AutomationRules', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        ruleVersionId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'AutomationRuleVersions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        resourceId: { type: Sequelize.INTEGER, allowNull: false },
        purposeKey: { type: Sequelize.STRING(160), allowNull: false },
        itemType: { type: Sequelize.STRING(40), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        lifecycleState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: true },
        lastReconciledRunId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'AutomationRuns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        lastReconciledEventId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        managedFields: { type: Sequelize.JSON, allowNull: false },
        lastAppliedSnapshot: { type: Sequelize.JSON, allowNull: false },
        configurationSnapshot: { type: Sequelize.JSON, allowNull: false },
        reconciliationPolicy: { type: Sequelize.JSON, allowNull: false },
        humanOverrideAt: { type: Sequelize.DATE, allowNull: true },
        humanOverrideBy: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        humanOverrideReason: { type: Sequelize.STRING(255), allowNull: true },
        lastDecision: { type: Sequelize.STRING(40), allowNull: true },
        lastDecisionReason: { type: Sequelize.STRING(255), allowNull: true },
        lastReconciledAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }

    await ensureIndex(
      queryInterface,
      'AutomationResourceBindings',
      ['wineryId', 'ruleId', 'resourceType', 'resourceId', 'purposeKey'],
      { unique: true, name: 'automation_resource_bindings_unique_purpose' }
    );
    await ensureIndex(
      queryInterface,
      'AutomationResourceBindings',
      ['wineryId', 'resourceType', 'resourceId', 'lifecycleState'],
      { name: 'automation_resource_bindings_resource_state' }
    );
    await ensureIndex(
      queryInterface,
      'AutomationResourceBindings',
      ['wineryId', 'itemType', 'itemId'],
      { name: 'automation_resource_bindings_item' }
    );
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'AutomationResourceBindings')) {
      await queryInterface.dropTable('AutomationResourceBindings');
    }
  }
};
