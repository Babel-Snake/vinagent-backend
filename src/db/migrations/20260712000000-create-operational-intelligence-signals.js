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
    if (await hasTable(queryInterface, 'OperationalIntelligenceSignals')) return;

    await queryInterface.createTable('OperationalIntelligenceSignals', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      signalType: {
        type: Sequelize.ENUM(
          'REQUEST_AGING',
          'RECURRENCE',
          'CLASSIFICATION_CORRECTION',
          'CONVERSION_OUTCOME',
          'NOTICE_ACKNOWLEDGEMENT',
          'TREND'
        ),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_CREATED'),
        allowNull: false,
        defaultValue: 'OPEN'
      },
      severity: {
        type: Sequelize.ENUM('info', 'warning', 'critical'),
        allowNull: false,
        defaultValue: 'info'
      },
      title: { type: Sequelize.STRING, allowNull: false },
      summary: { type: Sequelize.TEXT, allowNull: true },
      fingerprint: { type: Sequelize.STRING, allowNull: false },
      evidence: { type: Sequelize.JSON, allowNull: true },
      periodStart: { type: Sequelize.DATE, allowNull: true },
      periodEnd: { type: Sequelize.DATE, allowNull: true },
      reviewNote: { type: Sequelize.TEXT, allowNull: true },
      reviewedAt: { type: Sequelize.DATE, allowNull: true },
      wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      areaId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reviewedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      actionTaskId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'fingerprint'], { unique: true, name: 'operational_intelligence_signals_fingerprint_unique' });
    await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'status', 'createdAt'], { name: 'operational_intelligence_signals_status_date' });
    await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'signalType', 'createdAt'], { name: 'operational_intelligence_signals_type_date' });
    await queryInterface.addIndex('OperationalIntelligenceSignals', ['wineryId', 'areaId', 'createdAt'], { name: 'operational_intelligence_signals_area_date' });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'OperationalIntelligenceSignals')) {
      await queryInterface.dropTable('OperationalIntelligenceSignals');
    }
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_OperationalIntelligenceSignals_signalType";');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_OperationalIntelligenceSignals_status";');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_OperationalIntelligenceSignals_severity";');
    }
  }
};
