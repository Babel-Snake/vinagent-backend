const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationEvent extends Model {
    static associate(models) {
      IntegrationEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationEvent.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      IntegrationEvent.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'Reviewer' });

      if (models.Notice) {
        IntegrationEvent.hasMany(models.Notice, { foreignKey: 'sourceEventId', as: 'Notices' });
      }
      IntegrationEvent.hasMany(models.IntegrationEventItem, { foreignKey: 'eventId', as: 'LinkedItems' });
      IntegrationEvent.hasMany(models.OperationalRequest, { foreignKey: 'sourceEventId', as: 'OperationalRequests' });
      IntegrationEvent.hasMany(models.OperationalRecord, { foreignKey: 'sourceEventId', as: 'OperationalRecords' });
      IntegrationEvent.belongsTo(models.OperationalArea, { foreignKey: 'suggestedAreaId', as: 'SuggestedArea' });
      IntegrationEvent.belongsTo(models.OperationalArea, { foreignKey: 'confirmedAreaId', as: 'ConfirmedArea' });
      IntegrationEvent.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationEvent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'externalResourceReferenceId',
        as: 'ExternalResource'
      });
      IntegrationEvent.belongsTo(models.IntegrationSyncRun, { foreignKey: 'syncRunId', as: 'SyncRun' });
      IntegrationEvent.hasMany(models.Booking, { foreignKey: 'lastCanonicalEventId', as: 'LastProjectedBookings' });
      IntegrationEvent.hasMany(models.BookingStatusEvent, { foreignKey: 'sourceEventId', as: 'BookingStatusEvents' });
      IntegrationEvent.hasMany(models.ExternalResourceReference, { foreignKey: 'lastSourceEventId', as: 'LastSourceForResources' });
      IntegrationEvent.hasMany(models.ExternalResourceObservation, { foreignKey: 'sourceEventId', as: 'SourceObservations' });
      IntegrationEvent.hasOne(models.CanonicalEventOutbox, { foreignKey: 'eventId', as: 'OutboxEntry' });
      IntegrationEvent.hasMany(models.IntegrationJob, { foreignKey: 'sourceEventId', as: 'IntegrationJobs' });
      IntegrationEvent.hasMany(models.OperationalResourceLink, { foreignKey: 'sourceEventId', as: 'ResourceLinks' });
      IntegrationEvent.hasMany(models.BusinessEntityLinkEvidence, {
        foreignKey: 'sourceEventId',
        as: 'BusinessEntityLinkEvidence'
      });
      IntegrationEvent.hasMany(models.MessageDeliveryEvent, {
        foreignKey: 'sourceEventId',
        as: 'MessageDeliveryEvents'
      });
      IntegrationEvent.hasMany(models.IntelligenceFact, {
        foreignKey: 'sourceEventId',
        as: 'IntelligenceFacts'
      });
      IntegrationEvent.hasMany(models.AutomationResourceBinding, { foreignKey: 'lastReconciledEventId', as: 'ReconciledResourceBindings' });
    }
  }

  IntegrationEvent.init(
    {
      provider: {
        type: DataTypes.STRING,
        allowNull: false
      },
      intakeMethod: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'manual'
      },
      eventType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      externalEventId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      rawPayload: {
        type: DataTypes.JSON,
        allowNull: true
      },
      normalizedPayload: {
        type: DataTypes.JSON,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM(
          'RECEIVED',
          'NORMALIZED',
          'PENDING_REVIEW',
          'PROCESSED',
          'IGNORED',
          'ARCHIVED',
          'FAILED',
          'DUPLICATE'
        ),
        allowNull: false,
        defaultValue: 'RECEIVED'
      },
      processingError: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      relatedRecordType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      relatedRecordId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      },
      connectionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'IntegrationConnections', key: 'id' }
      },
      eventScopeKey: {
        type: DataTypes.STRING(180),
        allowNull: true
      },
      idempotencyKey: {
        type: DataTypes.STRING,
        allowNull: true
      },
      eventClass: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'INTAKE'
      },
      schemaVersion: {
        type: DataTypes.STRING(40),
        allowNull: true
      },
      occurredAtSource: {
        type: DataTypes.DATE,
        allowNull: true
      },
      providerEventVersion: {
        type: DataTypes.STRING,
        allowNull: true
      },
      correlationId: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      causationId: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      externalResourceReferenceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'ExternalResourceReferences', key: 'id' }
      },
      syncRunId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'IntegrationSyncRuns', key: 'id' }
      },
      rawPayloadExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      redactionProfile: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      ingestionPurpose: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'LIVE'
      },
      automationEligible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      automationEligibilityReason: {
        type: DataTypes.STRING,
        allowNull: true
      },
      suggestedAreaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' }
      },
      confirmedAreaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'OperationalAreas', key: 'id' }
      },
      areaConfidence: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true
      },
      areaMappingSource: {
        type: DataTypes.ENUM('RULE', 'MANUAL', 'ADAPTER', 'AI', 'DEFAULT'),
        allowNull: true
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'IntegrationEvent',
      tableName: 'IntegrationEvents',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['wineryId', 'eventScopeKey', 'idempotencyKey'],
          name: 'integration_events_scope_idempotency_unique'
        },
        {
          fields: ['wineryId', 'connectionId', 'eventClass', 'receivedAt'],
          name: 'integration_events_connection_class_date'
        },
        { fields: ['externalResourceReferenceId'], name: 'integration_events_external_resource' },
        { fields: ['syncRunId'], name: 'integration_events_sync_run' },
        { fields: ['correlationId'], name: 'integration_events_correlation' }
      ]
    }
  );

  return IntegrationEvent;
};
