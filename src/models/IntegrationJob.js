const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationJob extends Model {
    static associate(models) {
      IntegrationJob.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationJob.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationJob.belongsTo(models.IntegrationSyncRun, { foreignKey: 'syncRunId', as: 'SyncRun' });
      IntegrationJob.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      IntegrationJob.belongsTo(models.IntegrationJob, { foreignKey: 'replayedFromJobId', as: 'ReplayedFromJob' });
      IntegrationJob.hasMany(models.IntegrationJob, { foreignKey: 'replayedFromJobId', as: 'Replays' });
      IntegrationJob.belongsTo(models.User, { foreignKey: 'cancelledBy', as: 'CancelledBy' });
    }
  }

  IntegrationJob.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    connectionId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationConnections', key: 'id' } },
    jobKind: { type: DataTypes.STRING(120), allowNull: false },
    jobScopeKey: { type: DataTypes.STRING(180), allowNull: false },
    resourceType: DataTypes.STRING,
    streamKey: DataTypes.STRING,
    payloadSchemaVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    payload: { type: DataTypes.JSON, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING, allowNull: false },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PENDING' },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    nextAttemptAt: DataTypes.DATE,
    attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    leaseOwner: DataTypes.STRING,
    leaseExpiresAt: DataTypes.DATE,
    startedAt: DataTypes.DATE,
    completedAt: DataTypes.DATE,
    retryBackoffSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    result: DataTypes.JSON,
    lastErrorCode: DataTypes.STRING,
    lastErrorSummary: DataTypes.TEXT,
    deadLetteredAt: DataTypes.DATE,
    replayedFromJobId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationJobs', key: 'id' }
    },
    cancelledAt: DataTypes.DATE,
    cancelledBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    cancellationReason: DataTypes.TEXT,
    syncRunId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationSyncRuns', key: 'id' } },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    correlationId: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'IntegrationJob',
    tableName: 'IntegrationJobs',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'jobScopeKey', 'jobKind', 'idempotencyKey'], name: 'integration_jobs_unique_idempotency' },
      { fields: ['status', 'scheduledAt', 'nextAttemptAt', 'priority'], name: 'integration_jobs_due_queue' },
      { fields: ['leaseExpiresAt'], name: 'integration_jobs_lease' },
      { fields: ['wineryId', 'connectionId', 'resourceType'], name: 'integration_jobs_resource' },
      { fields: ['wineryId', 'status', 'deadLetteredAt'], name: 'integration_jobs_dead_letter' },
      { fields: ['replayedFromJobId'], name: 'integration_jobs_replay_lineage' }
    ]
  });

  return IntegrationJob;
};
