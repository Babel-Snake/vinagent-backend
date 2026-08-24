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

async function removeIndexIfPresent(queryInterface, tableName, indexName) {
  if (await hasIndex(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
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
    if (!(await hasTable(queryInterface, 'WineryLocations'))) {
      await queryInterface.createTable('WineryLocations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        parentLocationId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'WineryLocations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        code: { type: Sequelize.STRING(80), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        locationType: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'VENUE' },
        timeZone: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'Australia/Adelaide' },
        addressLine1: { type: Sequelize.STRING(255), allowNull: true },
        addressLine2: { type: Sequelize.STRING(255), allowNull: true },
        suburb: { type: Sequelize.STRING(120), allowNull: true },
        state: { type: Sequelize.STRING(120), allowNull: true },
        postcode: { type: Sequelize.STRING(24), allowNull: true },
        country: { type: Sequelize.STRING(120), allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WineryLocations', ['wineryId', 'code'], {
      unique: true,
      name: 'winery_locations_unique_code'
    });
    await ensureIndex(queryInterface, 'WineryLocations', ['wineryId', 'isActive', 'locationType'], {
      name: 'winery_locations_active_type'
    });

    if (!(await hasTable(queryInterface, 'IntegrationConnections'))) {
      await queryInterface.createTable('IntegrationConnections', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        connectionKey: { type: Sequelize.STRING(120), allowNull: false },
        providerKey: { type: Sequelize.STRING(120), allowNull: false },
        displayName: { type: Sequelize.STRING(160), allowNull: false },
        manifestVersion: { type: Sequelize.STRING(40), allowNull: true },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'PENDING' },
        externalAccountId: { type: Sequelize.STRING(255), allowNull: true },
        externalLocationId: { type: Sequelize.STRING(255), allowNull: true },
        authReference: { type: Sequelize.STRING(255), allowNull: true },
        configuration: { type: Sequelize.JSON, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        connectedAt: { type: Sequelize.DATE, allowNull: true },
        disabledAt: { type: Sequelize.DATE, allowNull: true },
        lastHealthCheckedAt: { type: Sequelize.DATE, allowNull: true },
        lastHealthyAt: { type: Sequelize.DATE, allowNull: true },
        lastErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        lastErrorSummary: { type: Sequelize.TEXT, allowNull: true },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        updatedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationConnections', ['wineryId', 'connectionKey'], {
      unique: true,
      name: 'integration_connections_unique_key'
    });
    await ensureIndex(queryInterface, 'IntegrationConnections', ['wineryId', 'providerKey', 'status'], {
      name: 'integration_connections_provider_status'
    });

    if (!(await hasTable(queryInterface, 'IntegrationConnectionScopes'))) {
      await queryInterface.createTable('IntegrationConnectionScopes', {
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
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        domain: { type: Sequelize.STRING(80), allowNull: false },
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
        priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        isDefault: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationConnectionScopes', ['connectionId', 'domain', 'scopeKey'], {
      unique: true,
      name: 'integration_connection_scopes_unique'
    });
    await ensureIndex(queryInterface, 'IntegrationConnectionScopes', ['wineryId', 'domain', 'scopeKey', 'isActive'], {
      name: 'integration_connection_scopes_lookup'
    });

    if (!(await hasTable(queryInterface, 'IntegrationConnectionCapabilities'))) {
      await queryInterface.createTable('IntegrationConnectionCapabilities', {
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
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        capabilityKey: { type: Sequelize.STRING(160), allowNull: false },
        kind: { type: Sequelize.STRING(24), allowNull: false },
        contractVersion: { type: Sequelize.STRING(40), allowNull: false, defaultValue: '1' },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        availabilityStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'AVAILABLE' },
        maxProjectionAgeSeconds: { type: Sequelize.INTEGER, allowNull: true },
        supportsWebhook: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        supportsPolling: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        lastVerifiedAt: { type: Sequelize.DATE, allowNull: true },
        unavailableReason: { type: Sequelize.TEXT, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationConnectionCapabilities', ['connectionId', 'capabilityKey', 'contractVersion'], {
      unique: true,
      name: 'integration_connection_capabilities_unique'
    });
    await ensureIndex(queryInterface, 'IntegrationConnectionCapabilities', ['wineryId', 'capabilityKey', 'enabled'], {
      name: 'integration_connection_capabilities_lookup'
    });

    if (!(await hasTable(queryInterface, 'IntegrationSyncStates'))) {
      await queryInterface.createTable('IntegrationSyncStates', {
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
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        streamKey: { type: Sequelize.STRING(180), allowNull: false },
        cursor: { type: Sequelize.TEXT, allowNull: true },
        watermarkAt: { type: Sequelize.DATE, allowNull: true },
        initialBackfillStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NOT_STARTED' },
        lastSuccessfulSyncAt: { type: Sequelize.DATE, allowNull: true },
        nextScheduledAt: { type: Sequelize.DATE, allowNull: true },
        consecutiveFailures: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        lastErrorSummary: { type: Sequelize.TEXT, allowNull: true },
        lastErrorAt: { type: Sequelize.DATE, allowNull: true },
        leaseOwner: { type: Sequelize.STRING(160), allowNull: true },
        leaseExpiresAt: { type: Sequelize.DATE, allowNull: true },
        statistics: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationSyncStates', ['connectionId', 'resourceType', 'streamKey'], {
      unique: true,
      name: 'integration_sync_states_unique_stream'
    });
    await ensureIndex(queryInterface, 'IntegrationSyncStates', ['wineryId', 'nextScheduledAt'], {
      name: 'integration_sync_states_schedule'
    });
    await ensureIndex(queryInterface, 'IntegrationSyncStates', ['leaseExpiresAt'], {
      name: 'integration_sync_states_lease'
    });

    if (!(await hasTable(queryInterface, 'IntegrationSyncRuns'))) {
      await queryInterface.createTable('IntegrationSyncRuns', {
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
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        syncStateId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationSyncStates', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        streamKey: { type: Sequelize.STRING(180), allowNull: false },
        mode: { type: Sequelize.STRING(40), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
        cursorBefore: { type: Sequelize.TEXT, allowNull: true },
        cursorAfter: { type: Sequelize.TEXT, allowNull: true },
        watermarkBefore: { type: Sequelize.DATE, allowNull: true },
        watermarkAfter: { type: Sequelize.DATE, allowNull: true },
        fetchedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        updatedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        unchangedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        tombstonedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        failedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        rateLimitMetadata: { type: Sequelize.JSON, allowNull: true },
        retryMetadata: { type: Sequelize.JSON, allowNull: true },
        errorCode: { type: Sequelize.STRING(120), allowNull: true },
        errorSummary: { type: Sequelize.TEXT, allowNull: true },
        correlationId: { type: Sequelize.STRING(120), allowNull: true },
        startedAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationSyncRuns', ['connectionId', 'resourceType', 'streamKey', 'startedAt'], {
      name: 'integration_sync_runs_stream_date'
    });
    await ensureIndex(queryInterface, 'IntegrationSyncRuns', ['wineryId', 'status', 'startedAt'], {
      name: 'integration_sync_runs_status_date'
    });
    await ensureIndex(queryInterface, 'IntegrationSyncRuns', ['correlationId'], {
      name: 'integration_sync_runs_correlation'
    });

    if (!(await hasTable(queryInterface, 'ExternalResourceReferences'))) {
      await queryInterface.createTable('ExternalResourceReferences', {
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
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        externalId: { type: Sequelize.STRING(255), allowNull: false },
        externalParentId: { type: Sequelize.STRING(255), allowNull: true },
        canonicalType: { type: Sequelize.STRING(120), allowNull: true },
        canonicalId: { type: Sequelize.INTEGER, allowNull: true },
        providerVersion: { type: Sequelize.STRING(255), allowNull: true },
        etag: { type: Sequelize.STRING(255), allowNull: true },
        sourceHash: { type: Sequelize.STRING(64), allowNull: true },
        providerCreatedAt: { type: Sequelize.DATE, allowNull: true },
        providerUpdatedAt: { type: Sequelize.DATE, allowNull: true },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        lastSyncedAt: { type: Sequelize.DATE, allowNull: true },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        lastSourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        lastSyncRunId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationSyncRuns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        resolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        resolutionMethod: { type: Sequelize.STRING(80), allowNull: true },
        resolutionConfidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        resolvedAt: { type: Sequelize.DATE, allowNull: true },
        resolvedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ExternalResourceReferences', ['connectionId', 'resourceType', 'externalId'], {
      unique: true,
      name: 'external_resource_references_unique'
    });
    await ensureIndex(queryInterface, 'ExternalResourceReferences', ['wineryId', 'canonicalType', 'canonicalId'], {
      name: 'external_resource_references_canonical'
    });
    await ensureIndex(queryInterface, 'ExternalResourceReferences', ['wineryId', 'resourceType', 'resolutionStatus'], {
      name: 'external_resource_references_resolution'
    });

    if (!(await hasTable(queryInterface, 'ExternalResourceObservations'))) {
      await queryInterface.createTable('ExternalResourceObservations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        externalResourceReferenceId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'ExternalResourceReferences', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        sourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        schemaVersion: { type: Sequelize.STRING(40), allowNull: false },
        observationKey: { type: Sequelize.STRING(255), allowNull: false },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: true },
        sourceHash: { type: Sequelize.STRING(64), allowNull: true },
        normalizedState: { type: Sequelize.JSON, allowNull: false },
        providerEffectiveAt: { type: Sequelize.DATE, allowNull: true },
        providerUpdatedAt: { type: Sequelize.DATE, allowNull: true },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        validFrom: { type: Sequelize.DATE, allowNull: false },
        supersededAt: { type: Sequelize.DATE, allowNull: true },
        sensitivityClass: { type: Sequelize.STRING(80), allowNull: true },
        redactionProfile: { type: Sequelize.STRING(120), allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ExternalResourceObservations', ['externalResourceReferenceId', 'schemaVersion', 'observationKey'], {
      unique: true,
      name: 'external_resource_observations_unique'
    });
    await ensureIndex(queryInterface, 'ExternalResourceObservations', ['wineryId', 'observedAt'], {
      name: 'external_resource_observations_winery_date'
    });

    if (!(await hasTable(queryInterface, 'ProjectionIssues'))) {
      await queryInterface.createTable('ProjectionIssues', {
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
        externalResourceReferenceId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'ExternalResourceReferences', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        issueType: { type: Sequelize.STRING(120), allowNull: false },
        fingerprint: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'OPEN' },
        severity: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'WARNING' },
        title: { type: Sequelize.STRING(200), allowNull: false },
        summary: { type: Sequelize.TEXT, allowNull: true },
        evidence: { type: Sequelize.JSON, allowNull: true },
        candidates: { type: Sequelize.JSON, allowNull: true },
        sourceVersion: { type: Sequelize.STRING(255), allowNull: true },
        observationCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        detectedAt: { type: Sequelize.DATE, allowNull: false },
        lastObservedAt: { type: Sequelize.DATE, allowNull: false },
        resolvedAt: { type: Sequelize.DATE, allowNull: true },
        resolvedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resolutionNote: { type: Sequelize.TEXT, allowNull: true },
        resolutionData: { type: Sequelize.JSON, allowNull: true },
        supersedesIssueId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'ProjectionIssues', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ProjectionIssues', ['wineryId', 'fingerprint'], {
      unique: true,
      name: 'projection_issues_unique_fingerprint'
    });
    await ensureIndex(queryInterface, 'ProjectionIssues', ['wineryId', 'status', 'severity', 'lastObservedAt'], {
      name: 'projection_issues_review_queue'
    });
    await ensureIndex(queryInterface, 'ProjectionIssues', ['externalResourceReferenceId', 'status'], {
      name: 'projection_issues_external_resource'
    });

    if (await hasTable(queryInterface, 'IntegrationEvents')) {
      const eventColumns = {
        connectionId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        eventScopeKey: { type: Sequelize.STRING(180), allowNull: true },
        idempotencyKey: { type: Sequelize.STRING(255), allowNull: true },
        eventClass: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'INTAKE' },
        schemaVersion: { type: Sequelize.STRING(40), allowNull: true },
        occurredAtSource: { type: Sequelize.DATE, allowNull: true },
        providerEventVersion: { type: Sequelize.STRING(255), allowNull: true },
        correlationId: { type: Sequelize.STRING(120), allowNull: true },
        causationId: { type: Sequelize.STRING(120), allowNull: true },
        externalResourceReferenceId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'ExternalResourceReferences', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        syncRunId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationSyncRuns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        rawPayloadExpiresAt: { type: Sequelize.DATE, allowNull: true },
        redactionProfile: { type: Sequelize.STRING(120), allowNull: true },
        ingestionPurpose: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'LIVE' },
        automationEligible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        automationEligibilityReason: { type: Sequelize.STRING(255), allowNull: true }
      };

      for (const [columnName, definition] of Object.entries(eventColumns)) {
        await addColumnIfMissing(queryInterface, 'IntegrationEvents', columnName, definition);
      }

      await ensureIndex(queryInterface, 'IntegrationEvents', ['wineryId', 'eventScopeKey', 'idempotencyKey'], {
        unique: true,
        name: 'integration_events_scope_idempotency_unique'
      });
      await ensureIndex(queryInterface, 'IntegrationEvents', ['wineryId', 'connectionId', 'eventClass', 'receivedAt'], {
        name: 'integration_events_connection_class_date'
      });
      await ensureIndex(queryInterface, 'IntegrationEvents', ['externalResourceReferenceId'], {
        name: 'integration_events_external_resource'
      });
      await ensureIndex(queryInterface, 'IntegrationEvents', ['syncRunId'], {
        name: 'integration_events_sync_run'
      });
      await ensureIndex(queryInterface, 'IntegrationEvents', ['correlationId'], {
        name: 'integration_events_correlation'
      });
    }
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationEvents')) {
      await removeForeignKeysForColumns(queryInterface, 'IntegrationEvents', [
        'connectionId',
        'externalResourceReferenceId',
        'syncRunId'
      ]);

      for (const indexName of [
        'integration_events_correlation',
        'integration_events_sync_run',
        'integration_events_external_resource',
        'integration_events_connection_class_date',
        'integration_events_scope_idempotency_unique'
      ]) {
        await removeIndexIfPresent(queryInterface, 'IntegrationEvents', indexName);
      }

      for (const columnName of [
        'automationEligibilityReason',
        'automationEligible',
        'ingestionPurpose',
        'redactionProfile',
        'rawPayloadExpiresAt',
        'syncRunId',
        'externalResourceReferenceId',
        'causationId',
        'correlationId',
        'providerEventVersion',
        'occurredAtSource',
        'schemaVersion',
        'eventClass',
        'idempotencyKey',
        'eventScopeKey',
        'connectionId'
      ]) {
        await removeColumnIfPresent(queryInterface, 'IntegrationEvents', columnName);
      }
    }

    for (const tableName of [
      'ProjectionIssues',
      'ExternalResourceObservations',
      'ExternalResourceReferences',
      'IntegrationSyncRuns',
      'IntegrationSyncStates',
      'IntegrationConnectionCapabilities',
      'IntegrationConnectionScopes',
      'IntegrationConnections',
      'WineryLocations'
    ]) {
      if (await hasTable(queryInterface, tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }
  }
};
