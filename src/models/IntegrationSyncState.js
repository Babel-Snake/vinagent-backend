const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationSyncState extends Model {
    static associate(models) {
      IntegrationSyncState.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationSyncState.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      IntegrationSyncState.belongsTo(models.User, { foreignKey: 'pausedBy', as: 'PausedBy' });
      IntegrationSyncState.hasMany(models.IntegrationSyncRun, { foreignKey: 'syncStateId', as: 'Runs' });
    }
  }

  IntegrationSyncState.init({
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
    resourceType: { type: DataTypes.STRING(120), allowNull: false },
    streamKey: { type: DataTypes.STRING(180), allowNull: false },
    cursor: DataTypes.TEXT,
    watermarkAt: DataTypes.DATE,
    initialBackfillStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NOT_STARTED' },
    lastSuccessfulSyncAt: DataTypes.DATE,
    nextScheduledAt: DataTypes.DATE,
    operationalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    pausedAt: DataTypes.DATE,
    pausedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    pauseReason: DataTypes.TEXT,
    consecutiveFailures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastErrorCode: DataTypes.STRING,
    lastErrorSummary: DataTypes.TEXT,
    lastErrorAt: DataTypes.DATE,
    leaseOwner: DataTypes.STRING,
    leaseExpiresAt: DataTypes.DATE,
    statistics: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'IntegrationSyncState',
    tableName: 'IntegrationSyncStates',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['connectionId', 'resourceType', 'streamKey'], name: 'integration_sync_states_unique_stream' },
      { fields: ['wineryId', 'nextScheduledAt'], name: 'integration_sync_states_schedule' },
      { fields: ['wineryId', 'operationalStatus', 'resourceType'], name: 'integration_sync_states_operational_status' },
      { fields: ['leaseExpiresAt'], name: 'integration_sync_states_lease' }
    ]
  });

  return IntegrationSyncState;
};
