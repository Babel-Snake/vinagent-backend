const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationSyncRun extends Model {
    static associate(models) {
      IntegrationSyncRun.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationSyncRun.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationSyncRun.belongsTo(models.IntegrationSyncState, { foreignKey: 'syncStateId', as: 'SyncState' });
      IntegrationSyncRun.hasMany(models.ExternalResourceReference, { foreignKey: 'lastSyncRunId', as: 'LastSyncedResources' });
      IntegrationSyncRun.hasMany(models.IntegrationEvent, { foreignKey: 'syncRunId', as: 'Events' });
      IntegrationSyncRun.hasMany(models.IntegrationJob, { foreignKey: 'syncRunId', as: 'Jobs' });
    }
  }

  IntegrationSyncRun.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    syncStateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationSyncStates', key: 'id' }
    },
    resourceType: { type: DataTypes.STRING(120), allowNull: false },
    streamKey: { type: DataTypes.STRING(180), allowNull: false },
    mode: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
    cursorBefore: DataTypes.TEXT,
    cursorAfter: DataTypes.TEXT,
    watermarkBefore: DataTypes.DATE,
    watermarkAfter: DataTypes.DATE,
    fetchedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updatedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    unchangedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    tombstonedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rateLimitMetadata: DataTypes.JSON,
    retryMetadata: DataTypes.JSON,
    errorCode: DataTypes.STRING,
    errorSummary: DataTypes.TEXT,
    correlationId: DataTypes.STRING,
    startedAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'IntegrationSyncRun',
    tableName: 'IntegrationSyncRuns',
    timestamps: true,
    indexes: [
      { fields: ['connectionId', 'resourceType', 'streamKey', 'startedAt'], name: 'integration_sync_runs_stream_date' },
      { fields: ['wineryId', 'status', 'startedAt'], name: 'integration_sync_runs_status_date' },
      { fields: ['correlationId'], name: 'integration_sync_runs_correlation' }
    ]
  });

  return IntegrationSyncRun;
};
