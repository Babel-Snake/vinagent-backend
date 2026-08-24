const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ExternalResourceReference extends Model {
    static associate(models) {
      ExternalResourceReference.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ExternalResourceReference.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      ExternalResourceReference.hasOne(models.Booking, { foreignKey: 'primarySourceReferenceId', as: 'PrimaryBooking' });
      ExternalResourceReference.hasMany(models.BookingRequirement, { foreignKey: 'sourceReferenceId', as: 'BookingRequirements' });
      ExternalResourceReference.belongsTo(models.IntegrationEvent, { foreignKey: 'lastSourceEventId', as: 'LastSourceEvent' });
      ExternalResourceReference.belongsTo(models.IntegrationSyncRun, { foreignKey: 'lastSyncRunId', as: 'LastSyncRun' });
      ExternalResourceReference.belongsTo(models.User, { foreignKey: 'resolvedBy', as: 'Resolver' });
      ExternalResourceReference.hasMany(models.ExternalResourceObservation, {
        foreignKey: 'externalResourceReferenceId',
        as: 'Observations'
      });
      ExternalResourceReference.hasMany(models.ProjectionIssue, {
        foreignKey: 'externalResourceReferenceId',
        as: 'ProjectionIssues'
      });
      ExternalResourceReference.hasMany(models.IntegrationEvent, {
        foreignKey: 'externalResourceReferenceId',
        as: 'Events'
      });
      ExternalResourceReference.hasMany(models.CustomerContactPoint, {
        foreignKey: 'sourceReferenceId',
        as: 'CustomerContactPoints'
      });
      ExternalResourceReference.hasMany(models.CustomerAddress, {
        foreignKey: 'sourceReferenceId',
        as: 'CustomerAddresses'
      });
      ExternalResourceReference.hasMany(models.CustomerConsent, {
        foreignKey: 'evidenceReferenceId',
        as: 'CustomerConsentEvidence'
      });
      ExternalResourceReference.hasMany(models.CustomerLifecycleMilestone, {
        foreignKey: 'sourceReferenceId',
        as: 'CustomerLifecycleMilestones'
      });
      ExternalResourceReference.hasOne(models.WineClubMembership, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryWineClubMembership'
      });
      ExternalResourceReference.hasOne(models.WineClubAllocation, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryWineClubAllocation'
      });
      ExternalResourceReference.hasMany(models.WineClubMembershipEvent, {
        foreignKey: 'sourceReferenceId',
        as: 'WineClubMembershipEvents'
      });
      ExternalResourceReference.hasOne(models.SalesOrder, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySalesOrder'
      });
      ExternalResourceReference.hasMany(models.PaymentSummaryEvent, {
        foreignKey: 'sourceReferenceId',
        as: 'PaymentSummaryEvents'
      });
      ExternalResourceReference.hasOne(models.RefundSummary, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryRefundSummary'
      });
      ExternalResourceReference.hasOne(models.InventoryPosition, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryInventoryPosition'
      });
      ExternalResourceReference.hasMany(models.InventorySnapshot, {
        foreignKey: 'sourceReferenceId',
        as: 'InventorySnapshots'
      });
      ExternalResourceReference.hasMany(models.InventoryCommitment, {
        foreignKey: 'sourceReferenceId',
        as: 'InventoryCommitments'
      });
      ExternalResourceReference.hasOne(models.Shipment, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryShipment'
      });
      ExternalResourceReference.hasMany(models.ShipmentTrackingEvent, {
        foreignKey: 'sourceReferenceId',
        as: 'ShipmentTrackingEvents'
      });
      ExternalResourceReference.hasOne(models.RosterShift, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryRosterShift'
      });
      ExternalResourceReference.hasOne(models.StaffAvailabilityEvent, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryStaffAvailabilityEvent'
      });
      ExternalResourceReference.hasMany(models.StaffRoleSkill, {
        foreignKey: 'sourceReferenceId',
        as: 'StaffRoleSkills'
      });
      ExternalResourceReference.hasOne(models.Message, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimaryMessage'
      });
      ExternalResourceReference.hasMany(models.MessageDeliveryEvent, {
        foreignKey: 'sourceReferenceId',
        as: 'MessageDeliveryEvents'
      });
      ExternalResourceReference.hasMany(models.IntelligenceFact, {
        foreignKey: 'sourceReferenceId',
        as: 'IntelligenceFacts'
      });
      ExternalResourceReference.hasMany(models.BusinessEntityLinkEvidence, {
        foreignKey: 'sourceReferenceId',
        as: 'BusinessEntityLinkEvidence'
      });
    }
  }

  ExternalResourceReference.init({
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
    externalId: { type: DataTypes.STRING, allowNull: false },
    externalParentId: DataTypes.STRING,
    canonicalType: DataTypes.STRING,
    canonicalId: DataTypes.INTEGER,
    providerVersion: DataTypes.STRING,
    etag: DataTypes.STRING,
    sourceHash: DataTypes.STRING(64),
    providerCreatedAt: DataTypes.DATE,
    providerUpdatedAt: DataTypes.DATE,
    observedAt: { type: DataTypes.DATE, allowNull: false },
    lastSyncedAt: DataTypes.DATE,
    deletedAtSource: DataTypes.DATE,
    lastSourceEventId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationEvents', key: 'id' }
    },
    lastSyncRunId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationSyncRuns', key: 'id' }
    },
    providerExtensions: DataTypes.JSON,
    resolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    resolutionMethod: DataTypes.STRING,
    resolutionConfidence: DataTypes.DECIMAL(5, 4),
    resolvedAt: DataTypes.DATE,
    resolvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'ExternalResourceReference',
    tableName: 'ExternalResourceReferences',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['connectionId', 'resourceType', 'externalId'], name: 'external_resource_references_unique' },
      { fields: ['wineryId', 'canonicalType', 'canonicalId'], name: 'external_resource_references_canonical' },
      { fields: ['wineryId', 'resourceType', 'resolutionStatus'], name: 'external_resource_references_resolution' }
    ]
  });

  return ExternalResourceReference;
};
