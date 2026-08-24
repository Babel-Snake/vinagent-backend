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

const reference = (Sequelize, model, allowNull = false, onDelete = 'CASCADE') => ({
  type: Sequelize.INTEGER,
  allowNull,
  references: { model, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'IntelligenceFactMaterializationRuns'))) {
      await queryInterface.createTable('IntelligenceFactMaterializationRuns', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        runKey: { type: Sequelize.STRING(64), allowNull: false },
        requestHash: { type: Sequelize.STRING(64), allowNull: false },
        materializerKey: { type: Sequelize.STRING(160), allowNull: false },
        materializerVersion: { type: Sequelize.STRING(80), allowNull: false },
        subjectType: { type: Sequelize.STRING(120), allowNull: false },
        subjectId: { type: Sequelize.INTEGER, allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
        factsCreated: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        factsSuperseded: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        duplicateFacts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        startedAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        errorCode: { type: Sequelize.STRING(120), allowNull: true },
        errorSummary: { type: Sequelize.STRING(500), allowNull: true },
        reason: { type: Sequelize.STRING(1000), allowNull: false },
        requestedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'IntelligenceFactMaterializationRuns', ['wineryId', 'runKey'], {
      unique: true, name: 'intelligence_fact_runs_unique_request'
    });
    await ensureIndex(queryInterface, 'IntelligenceFactMaterializationRuns', [
      'wineryId', 'materializerKey', 'status', 'startedAt'
    ], {
      name: 'intelligence_fact_runs_status'
    });
    await ensureIndex(queryInterface, 'IntelligenceFactMaterializationRuns', [
      'wineryId', 'subjectType', 'subjectId', 'startedAt'
    ], {
      name: 'intelligence_fact_runs_subject'
    });

    if (!(await hasTable(queryInterface, 'IntelligenceFacts'))) {
      await queryInterface.createTable('IntelligenceFacts', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        areaId: reference(Sequelize, 'OperationalAreas', true, 'SET NULL'),
        subjectType: { type: Sequelize.STRING(120), allowNull: false },
        subjectId: { type: Sequelize.INTEGER, allowNull: false },
        factKey: { type: Sequelize.STRING(160), allowNull: false },
        factIdentityKey: { type: Sequelize.STRING(64), allowNull: false },
        factVersionKey: { type: Sequelize.STRING(64), allowNull: false },
        valueType: { type: Sequelize.STRING(20), allowNull: false },
        valueJson: { type: Sequelize.JSON, allowNull: false },
        unit: { type: Sequelize.STRING(40), allowNull: true },
        valueSchemaVersion: { type: Sequelize.STRING(40), allowNull: false },
        qualityClass: { type: Sequelize.STRING(40), allowNull: false },
        confidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        effectiveFrom: { type: Sequelize.DATE, allowNull: true },
        effectiveTo: { type: Sequelize.DATE, allowNull: true },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        staleAt: { type: Sequelize.DATE, allowNull: true },
        supersededAt: { type: Sequelize.DATE, allowNull: true },
        sourceConnectionId: reference(Sequelize, 'IntegrationConnections', true, 'SET NULL'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        derivationType: { type: Sequelize.STRING(40), allowNull: false },
        derivationKey: { type: Sequelize.STRING(160), allowNull: false },
        derivationVersion: { type: Sequelize.STRING(80), allowNull: false },
        evidence: { type: Sequelize.JSON, allowNull: true },
        sensitivity: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'INTERNAL' },
        materializationRunId: reference(
          Sequelize,
          'IntelligenceFactMaterializationRuns',
          true,
          'SET NULL'
        ),
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'IntelligenceFacts', ['wineryId', 'factVersionKey'], {
      unique: true, name: 'intelligence_facts_unique_version'
    });
    await ensureIndex(queryInterface, 'IntelligenceFacts', [
      'wineryId', 'subjectType', 'subjectId', 'factKey', 'supersededAt'
    ], {
      name: 'intelligence_facts_current_subject'
    });
    await ensureIndex(queryInterface, 'IntelligenceFacts', [
      'wineryId', 'factKey', 'qualityClass', 'staleAt'
    ], {
      name: 'intelligence_facts_quality_freshness'
    });
    await ensureIndex(queryInterface, 'IntelligenceFacts', [
      'wineryId', 'areaId', 'factKey', 'supersededAt'
    ], {
      name: 'intelligence_facts_area'
    });
    await ensureIndex(queryInterface, 'IntelligenceFacts', ['sourceReferenceId', 'createdAt'], {
      name: 'intelligence_facts_source_reference'
    });
    await ensureIndex(queryInterface, 'IntelligenceFacts', ['materializationRunId', 'createdAt'], {
      name: 'intelligence_facts_run'
    });
  },

  async down(queryInterface) {
    for (const tableName of ['IntelligenceFacts', 'IntelligenceFactMaterializationRuns']) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
