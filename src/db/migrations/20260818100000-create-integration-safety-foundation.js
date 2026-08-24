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

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await hasIndex(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeForeignKeysForColumns(queryInterface, tableName, columnNames) {
  if (!(await hasTable(queryInterface, tableName))) return;
  const targetColumns = new Set(columnNames);
  const references = await queryInterface.getForeignKeyReferencesForTable(tableName);
  const constraintNames = new Set(
    references
      .filter(reference => targetColumns.has(reference.columnName || reference.column_name))
      .map(reference => reference.constraintName || reference.constraint_name)
      .filter(Boolean)
  );
  for (const constraintName of constraintNames) {
    await queryInterface.removeConstraint(tableName, constraintName);
  }
}

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'DataAuthorityPolicySets'))) {
      await queryInterface.createTable('DataAuthorityPolicySets', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        scopeKey: { type: Sequelize.STRING(180), allowNull: false },
        areaId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        locationId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'WineryLocations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        domain: { type: Sequelize.STRING(80), allowNull: false },
        fieldGroup: { type: Sequelize.STRING(120), allowNull: false },
        lockVersion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'DataAuthorityPolicySets', ['wineryId', 'scopeKey', 'domain', 'fieldGroup'], {
      unique: true,
      name: 'data_authority_policy_sets_unique'
    });
    await ensureIndex(queryInterface, 'DataAuthorityPolicySets', ['wineryId', 'domain', 'fieldGroup', 'scopeKey'], {
      name: 'data_authority_policy_sets_lookup'
    });

    if (!(await hasTable(queryInterface, 'DataAuthorityPolicies'))) {
      await queryInterface.createTable('DataAuthorityPolicies', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        policySetId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'DataAuthorityPolicySets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        version: { type: Sequelize.INTEGER, allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'DRAFT' },
        resolutionStrategy: { type: Sequelize.STRING(80), allowNull: false },
        baselineFreshnessSeconds: { type: Sequelize.INTEGER, allowNull: true },
        definition: { type: Sequelize.JSON, allowNull: true },
        effectiveFrom: { type: Sequelize.DATE, allowNull: true },
        effectiveTo: { type: Sequelize.DATE, allowNull: true },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        approvedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        approvedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'DataAuthorityPolicies', ['policySetId', 'version'], {
      unique: true,
      name: 'data_authority_policies_unique_version'
    });
    await ensureIndex(queryInterface, 'DataAuthorityPolicies', ['wineryId', 'status', 'effectiveFrom'], {
      name: 'data_authority_policies_status_date'
    });

    if (!(await hasTable(queryInterface, 'DataAuthorityPolicySources'))) {
      await queryInterface.createTable('DataAuthorityPolicySources', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        policyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'DataAuthorityPolicies', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        connectionId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        sourceRole: { type: Sequelize.STRING(24), allowNull: false },
        sourceOrder: { type: Sequelize.INTEGER, allowNull: false },
        configuration: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'DataAuthorityPolicySources', ['policyId', 'connectionId'], {
      unique: true,
      name: 'data_authority_policy_sources_unique_connection'
    });
    await ensureIndex(queryInterface, 'DataAuthorityPolicySources', ['policyId', 'sourceOrder'], {
      unique: true,
      name: 'data_authority_policy_sources_unique_order'
    });

    if (!(await hasColumn(queryInterface, 'DataAuthorityPolicySets', 'activePolicyId'))) {
      await queryInterface.addColumn('DataAuthorityPolicySets', 'activePolicyId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'DataAuthorityPolicies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    await ensureIndex(queryInterface, 'DataAuthorityPolicySets', ['activePolicyId'], {
      name: 'data_authority_policy_sets_active_policy'
    });

    if (!(await hasTable(queryInterface, 'IntegrationJobs'))) {
      await queryInterface.createTable('IntegrationJobs', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        connectionId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        jobKind: { type: Sequelize.STRING(120), allowNull: false },
        jobScopeKey: { type: Sequelize.STRING(180), allowNull: false },
        resourceType: { type: Sequelize.STRING(120), allowNull: true },
        streamKey: { type: Sequelize.STRING(180), allowNull: true },
        payloadSchemaVersion: { type: Sequelize.STRING(40), allowNull: false, defaultValue: '1' },
        payload: { type: Sequelize.JSON, allowNull: false },
        idempotencyKey: { type: Sequelize.STRING(255), allowNull: false },
        priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'PENDING' },
        scheduledAt: { type: Sequelize.DATE, allowNull: false },
        nextAttemptAt: { type: Sequelize.DATE, allowNull: true },
        attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        maxAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
        leaseOwner: { type: Sequelize.STRING(160), allowNull: true },
        leaseExpiresAt: { type: Sequelize.DATE, allowNull: true },
        startedAt: { type: Sequelize.DATE, allowNull: true },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        retryBackoffSeconds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 60 },
        result: { type: Sequelize.JSON, allowNull: true },
        lastErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        lastErrorSummary: { type: Sequelize.TEXT, allowNull: true },
        syncRunId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationSyncRuns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        sourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        correlationId: { type: Sequelize.STRING(120), allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationJobs', ['wineryId', 'jobScopeKey', 'jobKind', 'idempotencyKey'], {
      unique: true,
      name: 'integration_jobs_unique_idempotency'
    });
    await ensureIndex(queryInterface, 'IntegrationJobs', ['status', 'scheduledAt', 'nextAttemptAt', 'priority'], {
      name: 'integration_jobs_due_queue'
    });
    await ensureIndex(queryInterface, 'IntegrationJobs', ['leaseExpiresAt'], {
      name: 'integration_jobs_lease'
    });
    await ensureIndex(queryInterface, 'IntegrationJobs', ['wineryId', 'connectionId', 'resourceType'], {
      name: 'integration_jobs_resource'
    });

    if (!(await hasTable(queryInterface, 'CanonicalEventOutbox'))) {
      await queryInterface.createTable('CanonicalEventOutbox', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        eventId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        outboxKey: { type: Sequelize.STRING(255), allowNull: false },
        aggregateType: { type: Sequelize.STRING(120), allowNull: false },
        aggregateId: { type: Sequelize.STRING(120), allowNull: false },
        aggregateRevision: { type: Sequelize.STRING(120), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'PENDING' },
        availableAt: { type: Sequelize.DATE, allowNull: false },
        attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        maxAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
        leaseOwner: { type: Sequelize.STRING(160), allowNull: true },
        leaseExpiresAt: { type: Sequelize.DATE, allowNull: true },
        deliveredAt: { type: Sequelize.DATE, allowNull: true },
        lastErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        lastErrorSummary: { type: Sequelize.TEXT, allowNull: true },
        correlationId: { type: Sequelize.STRING(120), allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'CanonicalEventOutbox', ['eventId'], {
      unique: true,
      name: 'canonical_event_outbox_unique_event'
    });
    await ensureIndex(queryInterface, 'CanonicalEventOutbox', ['wineryId', 'outboxKey'], {
      unique: true,
      name: 'canonical_event_outbox_unique_key'
    });
    await ensureIndex(queryInterface, 'CanonicalEventOutbox', ['status', 'availableAt', 'leaseExpiresAt'], {
      name: 'canonical_event_outbox_due_queue'
    });

    if (!(await hasTable(queryInterface, 'CustomerMergeRedirects'))) {
      await queryInterface.createTable('CustomerMergeRedirects', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        sourceMemberId: { type: Sequelize.INTEGER, allowNull: false },
        targetMemberId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Members', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        mergedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        mergedAt: { type: Sequelize.DATE, allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'CustomerMergeRedirects', ['wineryId', 'sourceMemberId'], {
      unique: true,
      name: 'customer_merge_redirects_unique_source'
    });
    await ensureIndex(queryInterface, 'CustomerMergeRedirects', ['wineryId', 'targetMemberId'], {
      name: 'customer_merge_redirects_target'
    });

    if (!(await hasTable(queryInterface, 'LocationAreaLinks'))) {
      await queryInterface.createTable('LocationAreaLinks', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        locationId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'WineryLocations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        areaId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'OperationalAreas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        relationshipType: { type: Sequelize.STRING(80), allowNull: false },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'LocationAreaLinks', ['wineryId', 'locationId', 'areaId', 'relationshipType'], {
      unique: true,
      name: 'location_area_links_unique'
    });
    await ensureIndex(queryInterface, 'LocationAreaLinks', ['wineryId', 'areaId'], {
      name: 'location_area_links_area'
    });

    if (!(await hasTable(queryInterface, 'OperationalResourceLinks'))) {
      await queryInterface.createTable('OperationalResourceLinks', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        itemType: { type: Sequelize.STRING(40), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        resourceId: { type: Sequelize.INTEGER, allowNull: false },
        linkType: { type: Sequelize.STRING(80), allowNull: false },
        automationRuleId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'AutomationRules', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        automationRunId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'AutomationRuns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        sourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'OperationalResourceLinks', ['wineryId', 'itemType', 'itemId', 'resourceType', 'resourceId', 'linkType'], {
      unique: true,
      name: 'operational_resource_links_unique'
    });
    await ensureIndex(queryInterface, 'OperationalResourceLinks', ['wineryId', 'resourceType', 'resourceId'], {
      name: 'operational_resource_links_resource'
    });
    await ensureIndex(queryInterface, 'OperationalResourceLinks', ['wineryId', 'itemType', 'itemId'], {
      name: 'operational_resource_links_item'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'DataAuthorityPolicySets')) {
      await removeForeignKeysForColumns(queryInterface, 'DataAuthorityPolicySets', ['activePolicyId']);
      if (await hasIndex(queryInterface, 'DataAuthorityPolicySets', 'data_authority_policy_sets_active_policy')) {
        await queryInterface.removeIndex('DataAuthorityPolicySets', 'data_authority_policy_sets_active_policy');
      }
      if (await hasColumn(queryInterface, 'DataAuthorityPolicySets', 'activePolicyId')) {
        await queryInterface.removeColumn('DataAuthorityPolicySets', 'activePolicyId');
      }
    }

    for (const tableName of [
      'OperationalResourceLinks',
      'LocationAreaLinks',
      'CustomerMergeRedirects',
      'CanonicalEventOutbox',
      'IntegrationJobs',
      'DataAuthorityPolicySources',
      'DataAuthorityPolicies',
      'DataAuthorityPolicySets'
    ]) {
      if (await hasTable(queryInterface, tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }
  }
};
