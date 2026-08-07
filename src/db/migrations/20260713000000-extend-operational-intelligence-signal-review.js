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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'OperationalIntelligenceSignals'))) return;

    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'dedupeKey'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'dedupeKey', { type: Sequelize.STRING, allowNull: true });
      await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'dedupeKey', 'status'], { name: 'operational_intelligence_signals_dedupe_status' });
    }
    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'suggestedAction'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'suggestedAction', { type: Sequelize.TEXT, allowNull: true });
    }
    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewOwnerUserId'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'reviewOwnerUserId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewDueAt'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'reviewDueAt', { type: Sequelize.DATE, allowNull: true });
    }
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewOwnerUserId') && await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewDueAt')) {
      await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'reviewOwnerUserId', 'reviewDueAt'], { name: 'operational_intelligence_signals_owner_due' }).catch(() => {});
    }
    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'lastMaterializedAt'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'lastMaterializedAt', { type: Sequelize.DATE, allowNull: true });
    }
    if (!(await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'materializationCount'))) {
      await queryInterface.addColumn('OperationalIntelligenceSignals', 'materializationCount', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    }
  },

  async down(queryInterface) {
    if (!(await hasTable(queryInterface, 'OperationalIntelligenceSignals'))) return;
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'materializationCount')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'materializationCount');
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'lastMaterializedAt')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'lastMaterializedAt');
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewDueAt')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'reviewDueAt');
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'reviewOwnerUserId')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'reviewOwnerUserId');
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'suggestedAction')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'suggestedAction');
    if (await hasColumn(queryInterface, 'OperationalIntelligenceSignals', 'dedupeKey')) await queryInterface.removeColumn('OperationalIntelligenceSignals', 'dedupeKey');
  }
};
