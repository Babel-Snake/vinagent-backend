const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationConnection extends Model {
    static associate(models) {
      IntegrationConnection.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationConnection.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      IntegrationConnection.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      IntegrationConnection.hasMany(models.IntegrationConnectionScope, { foreignKey: 'connectionId', as: 'Scopes' });
      IntegrationConnection.hasMany(models.IntegrationConnectionCapability, { foreignKey: 'connectionId', as: 'Capabilities' });
      IntegrationConnection.hasMany(models.IntegrationSyncState, { foreignKey: 'connectionId', as: 'SyncStates' });
      IntegrationConnection.hasMany(models.IntegrationSyncRun, { foreignKey: 'connectionId', as: 'SyncRuns' });
      IntegrationConnection.hasMany(models.ExternalResourceReference, { foreignKey: 'connectionId', as: 'ExternalResources' });
      IntegrationConnection.hasMany(models.ProjectionIssue, { foreignKey: 'connectionId', as: 'ProjectionIssues' });
      IntegrationConnection.hasMany(models.IntegrationEvent, { foreignKey: 'connectionId', as: 'Events' });
      IntegrationConnection.hasMany(models.DataAuthorityPolicySource, { foreignKey: 'connectionId', as: 'AuthorityPolicySources' });
      IntegrationConnection.hasMany(models.IntegrationJob, { foreignKey: 'connectionId', as: 'Jobs' });
      IntegrationConnection.hasMany(models.IntegrationCredential, { foreignKey: 'connectionId', as: 'Credentials' });
      IntegrationConnection.hasMany(models.IntegrationWebhookEndpoint, {
        foreignKey: 'connectionId',
        as: 'WebhookEndpoints'
      });
      IntegrationConnection.hasMany(models.IntegrationDomainActivation, { foreignKey: 'connectionId', as: 'DomainActivations' });
      IntegrationConnection.hasMany(models.Booking, { foreignKey: 'authorityConnectionId', as: 'AuthoritativeBookings' });
      IntegrationConnection.hasMany(models.WineClubMembership, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeWineClubMemberships'
      });
      IntegrationConnection.hasMany(models.WineClubAllocation, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeWineClubAllocations'
      });
      IntegrationConnection.hasMany(models.SalesOrder, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeSalesOrders'
      });
      IntegrationConnection.hasMany(models.RefundSummary, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeRefundSummaries'
      });
      IntegrationConnection.hasMany(models.BusinessEntityLinkEvidence, {
        foreignKey: 'sourceConnectionId',
        as: 'BusinessEntityLinkEvidence'
      });
      IntegrationConnection.hasMany(models.CustomerRollupContribution, {
        foreignKey: 'authorityConnectionId',
        as: 'CustomerRollupContributions'
      });
      IntegrationConnection.hasMany(models.RosterShift, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeRosterShifts'
      });
      IntegrationConnection.hasMany(models.StaffAvailabilityEvent, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthoritativeStaffAvailabilityEvents'
      });
      IntegrationConnection.hasMany(models.WorkforceCoverageObservation, {
        foreignKey: 'authorityConnectionId',
        as: 'WorkforceCoverageObservations'
      });
      IntegrationConnection.hasMany(models.WorkforceDemandMapping, {
        foreignKey: 'sourceConnectionId',
        as: 'WorkforceDemandMappings'
      });
      IntegrationConnection.hasMany(models.IntelligenceFact, {
        foreignKey: 'sourceConnectionId',
        as: 'IntelligenceFacts'
      });
    }
  }

  IntegrationConnection.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    connectionKey: { type: DataTypes.STRING(120), allowNull: false },
    providerKey: { type: DataTypes.STRING(120), allowNull: false },
    displayName: { type: DataTypes.STRING(160), allowNull: false },
    manifestVersion: DataTypes.STRING(40),
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PENDING' },
    externalAccountId: DataTypes.STRING,
    externalLocationId: DataTypes.STRING,
    authReference: DataTypes.STRING,
    configuration: DataTypes.JSON,
    providerExtensions: DataTypes.JSON,
    connectedAt: DataTypes.DATE,
    disabledAt: DataTypes.DATE,
    lastHealthCheckedAt: DataTypes.DATE,
    lastHealthyAt: DataTypes.DATE,
    lastErrorCode: DataTypes.STRING,
    lastErrorSummary: DataTypes.TEXT,
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'IntegrationConnection',
    tableName: 'IntegrationConnections',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'connectionKey'], name: 'integration_connections_unique_key' },
      { fields: ['wineryId', 'providerKey', 'status'], name: 'integration_connections_provider_status' }
    ]
  });

  return IntegrationConnection;
};
