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

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await hasIndex(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeIndexIfPresent(queryInterface, tableName, indexName) {
  if (await hasIndex(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'IntegrationSyncStates', 'operationalStatus', {
      type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE'
    });
    await addColumnIfMissing(queryInterface, 'IntegrationSyncStates', 'pausedAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'IntegrationSyncStates', 'pausedBy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, 'IntegrationSyncStates', 'pauseReason', {
      type: Sequelize.TEXT, allowNull: true
    });
    await ensureIndex(
      queryInterface,
      'IntegrationSyncStates',
      ['wineryId', 'operationalStatus', 'resourceType'],
      { name: 'integration_sync_states_operational_status' }
    );

    await addColumnIfMissing(queryInterface, 'IntegrationJobs', 'deadLetteredAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'IntegrationJobs', 'replayedFromJobId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationJobs', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, 'IntegrationJobs', 'cancelledAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'IntegrationJobs', 'cancelledBy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, 'IntegrationJobs', 'cancellationReason', {
      type: Sequelize.TEXT, allowNull: true
    });
    await ensureIndex(
      queryInterface,
      'IntegrationJobs',
      ['wineryId', 'status', 'deadLetteredAt'],
      { name: 'integration_jobs_dead_letter' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationJobs',
      ['replayedFromJobId'],
      { name: 'integration_jobs_replay_lineage' }
    );

    await addColumnIfMissing(queryInterface, 'CanonicalEventOutbox', 'deadLetteredAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'CanonicalEventOutbox', 'replayCount', {
      type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
    });
    await addColumnIfMissing(queryInterface, 'CanonicalEventOutbox', 'lastReplayedAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await ensureIndex(
      queryInterface,
      'CanonicalEventOutbox',
      ['wineryId', 'status', 'deadLetteredAt'],
      { name: 'canonical_event_outbox_dead_letter' }
    );

    if (!(await hasTable(queryInterface, 'IntegrationOperationAuditEvents'))) {
      await queryInterface.createTable('IntegrationOperationAuditEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        actorUserId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        action: { type: Sequelize.STRING(80), allowNull: false },
        targetType: { type: Sequelize.STRING(80), allowNull: false },
        targetId: { type: Sequelize.STRING(120), allowNull: false },
        connectionId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resourceType: { type: Sequelize.STRING(120), allowNull: true },
        streamKey: { type: Sequelize.STRING(180), allowNull: true },
        requestId: { type: Sequelize.STRING(36), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        beforeSnapshot: { type: Sequelize.JSON, allowNull: true },
        afterSnapshot: { type: Sequelize.JSON, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(
      queryInterface,
      'IntegrationOperationAuditEvents',
      ['wineryId', 'action', 'requestId'],
      { unique: true, name: 'integration_operation_audit_unique_request' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationOperationAuditEvents',
      ['wineryId', 'createdAt'],
      { name: 'integration_operation_audit_winery_date' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationOperationAuditEvents',
      ['wineryId', 'targetType', 'targetId'],
      { name: 'integration_operation_audit_target' }
    );
    await ensureIndex(
      queryInterface,
      'IntegrationOperationAuditEvents',
      ['connectionId', 'resourceType', 'streamKey'],
      { name: 'integration_operation_audit_stream' }
    );

    const migratedAt = new Date();
    await queryInterface.bulkUpdate(
      'IntegrationJobs',
      { deadLetteredAt: migratedAt },
      { status: 'FAILED', deadLetteredAt: null }
    );
    await queryInterface.bulkUpdate(
      'CanonicalEventOutbox',
      { deadLetteredAt: migratedAt },
      { status: 'FAILED', deadLetteredAt: null }
    );
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationOperationAuditEvents')) {
      await queryInterface.dropTable('IntegrationOperationAuditEvents');
    }
    await removeIndexIfPresent(queryInterface, 'CanonicalEventOutbox', 'canonical_event_outbox_dead_letter');
    await removeColumnIfPresent(queryInterface, 'CanonicalEventOutbox', 'lastReplayedAt');
    await removeColumnIfPresent(queryInterface, 'CanonicalEventOutbox', 'replayCount');
    await removeColumnIfPresent(queryInterface, 'CanonicalEventOutbox', 'deadLetteredAt');

    await removeIndexIfPresent(queryInterface, 'IntegrationJobs', 'integration_jobs_replay_lineage');
    await removeIndexIfPresent(queryInterface, 'IntegrationJobs', 'integration_jobs_dead_letter');
    await removeColumnIfPresent(queryInterface, 'IntegrationJobs', 'cancellationReason');
    await removeColumnIfPresent(queryInterface, 'IntegrationJobs', 'cancelledBy');
    await removeColumnIfPresent(queryInterface, 'IntegrationJobs', 'cancelledAt');
    await removeColumnIfPresent(queryInterface, 'IntegrationJobs', 'replayedFromJobId');
    await removeColumnIfPresent(queryInterface, 'IntegrationJobs', 'deadLetteredAt');

    await removeIndexIfPresent(queryInterface, 'IntegrationSyncStates', 'integration_sync_states_operational_status');
    await removeColumnIfPresent(queryInterface, 'IntegrationSyncStates', 'pauseReason');
    await removeColumnIfPresent(queryInterface, 'IntegrationSyncStates', 'pausedBy');
    await removeColumnIfPresent(queryInterface, 'IntegrationSyncStates', 'pausedAt');
    await removeColumnIfPresent(queryInterface, 'IntegrationSyncStates', 'operationalStatus');
  }
};
