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
    if (!(await hasTable(queryInterface, 'AutomationRules'))) {
      await queryInterface.createTable('AutomationRules', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        name: { type: Sequelize.STRING(160), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.ENUM('DRAFT', 'ACTIVE', 'PAUSED'), allowNull: false, defaultValue: 'DRAFT' },
        triggerType: { type: Sequelize.STRING(120), allowNull: false },
        currentVersion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        areaId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        createdBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        updatedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        activatedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        activatedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('AutomationRules', ['wineryId', 'status', 'triggerType'], { name: 'automation_rules_trigger' });
      await queryInterface.addIndex('AutomationRules', ['wineryId', 'areaId', 'status'], { name: 'automation_rules_area_status' });
    }

    if (!(await hasTable(queryInterface, 'AutomationRuleVersions'))) {
      await queryInterface.createTable('AutomationRuleVersions', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        ruleId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'AutomationRules', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        version: { type: Sequelize.INTEGER, allowNull: false },
        definition: { type: Sequelize.JSON, allowNull: false },
        definitionHash: { type: Sequelize.STRING(64), allowNull: false },
        createdBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('AutomationRuleVersions', ['ruleId', 'version'], { unique: true, name: 'automation_rule_versions_unique' });
      await queryInterface.addIndex('AutomationRuleVersions', ['wineryId', 'createdAt'], { name: 'automation_rule_versions_winery_date' });
    }

    if (!(await hasTable(queryInterface, 'AutomationRuns'))) {
      await queryInterface.createTable('AutomationRuns', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        ruleId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'AutomationRules', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        ruleVersionId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'AutomationRuleVersions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        sourceEventId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        sourceKey: { type: Sequelize.STRING(255), allowNull: false },
        status: { type: Sequelize.ENUM('RUNNING', 'NOT_MATCHED', 'ACTIONED', 'SKIPPED', 'FAILED'), allowNull: false, defaultValue: 'RUNNING' },
        triggerSnapshot: { type: Sequelize.JSON, allowNull: true },
        contextSnapshot: { type: Sequelize.JSON, allowNull: true },
        decisionSnapshot: { type: Sequelize.JSON, allowNull: true },
        error: { type: Sequelize.TEXT, allowNull: true },
        actionItemType: { type: Sequelize.ENUM('TASK', 'NOTICE'), allowNull: true },
        actionItemId: { type: Sequelize.INTEGER, allowNull: true },
        startedAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('AutomationRuns', ['ruleId', 'sourceKey'], { unique: true, name: 'automation_runs_source_unique' });
      await queryInterface.addIndex('AutomationRuns', ['wineryId', 'status', 'createdAt'], { name: 'automation_runs_status_date' });
      await queryInterface.addIndex('AutomationRuns', ['sourceEventId'], { name: 'automation_runs_source_event' });
    }

    if (!(await hasTable(queryInterface, 'AutomationRunSteps'))) {
      await queryInterface.createTable('AutomationRunSteps', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        runId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'AutomationRuns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        stepKey: { type: Sequelize.STRING(80), allowNull: false },
        capability: { type: Sequelize.STRING(160), allowNull: false },
        status: { type: Sequelize.ENUM('SUCCEEDED', 'FAILED', 'SKIPPED'), allowNull: false },
        input: { type: Sequelize.JSON, allowNull: true },
        output: { type: Sequelize.JSON, allowNull: true },
        error: { type: Sequelize.TEXT, allowNull: true },
        startedAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('AutomationRunSteps', ['runId', 'stepKey'], { unique: true, name: 'automation_run_steps_unique' });
      await queryInterface.addIndex('AutomationRunSteps', ['wineryId', 'createdAt'], { name: 'automation_run_steps_winery_date' });
    }
  },

  async down(queryInterface) {
    for (const tableName of ['AutomationRunSteps', 'AutomationRuns', 'AutomationRuleVersions', 'AutomationRules']) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
