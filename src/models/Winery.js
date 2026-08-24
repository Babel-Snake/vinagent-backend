const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Winery extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            Winery.hasMany(models.User, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Member, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Message, { foreignKey: 'wineryId' });
            Winery.hasMany(models.MessageDeliveryEvent, { foreignKey: 'wineryId', as: 'messageDeliveryEvents' });
            Winery.hasMany(models.IntelligenceFact, { foreignKey: 'wineryId', as: 'intelligenceFacts' });
            Winery.hasMany(models.IntelligenceFactMaterializationRun, {
                foreignKey: 'wineryId',
                as: 'intelligenceFactMaterializationRuns'
            });
            Winery.hasMany(models.Task, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Notice, { foreignKey: 'wineryId' });
            Winery.hasMany(models.NoticeTask, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalArea, { foreignKey: 'wineryId', as: 'OperationalAreas' });
            Winery.hasMany(models.OperationalAreaProfile, { foreignKey: 'wineryId', as: 'areaProfiles' });
            Winery.hasMany(models.OperationalAreaBookingsConfig, { foreignKey: 'wineryId', as: 'areaBookingsConfigs' });
            Winery.hasMany(models.AreaProductListing, { foreignKey: 'wineryId', as: 'areaProductListings' });
            Winery.hasMany(models.OperationalAreaIntegrationConfig, { foreignKey: 'wineryId', as: 'areaIntegrationConfigs' });
            Winery.hasMany(models.WineryContactArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.UserAreaMembership, { foreignKey: 'wineryId' });
            Winery.hasMany(models.TaskArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.NoticeArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.NoticeAcknowledgement, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalRequest, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalRequestArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalRecord, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalRecordArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalItemAuditEvent, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalItemComment, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalItemRelation, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalIntelligenceSignal, { foreignKey: 'wineryId' });
            Winery.hasMany(models.OperationalIntelligenceConfigAuditEvent, { foreignKey: 'wineryId' });
            Winery.hasMany(models.IntegrationEventItem, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Project, { foreignKey: 'wineryId' });
            Winery.hasMany(models.ProjectArea, { foreignKey: 'wineryId' });
            Winery.hasMany(models.ProjectParticipant, { foreignKey: 'wineryId' });
            Winery.hasMany(models.ProjectItem, { foreignKey: 'wineryId' });
            Winery.hasMany(models.ProjectTaskDependency, { foreignKey: 'wineryId' });
            Winery.hasMany(models.ProjectAuditEvent, { foreignKey: 'wineryId' });
            Winery.hasMany(models.EmailSyncState, { foreignKey: 'wineryId' });
            Winery.hasMany(models.WineryLocation, { foreignKey: 'wineryId', as: 'locations' });
            Winery.hasMany(models.IntegrationConnection, { foreignKey: 'wineryId', as: 'integrationConnections' });
            Winery.hasMany(models.IntegrationConnectionScope, { foreignKey: 'wineryId', as: 'integrationConnectionScopes' });
            Winery.hasMany(models.IntegrationConnectionCapability, { foreignKey: 'wineryId', as: 'integrationConnectionCapabilities' });
            Winery.hasMany(models.IntegrationSyncState, { foreignKey: 'wineryId', as: 'integrationSyncStates' });
            Winery.hasMany(models.IntegrationSyncRun, { foreignKey: 'wineryId', as: 'integrationSyncRuns' });
            Winery.hasMany(models.ExternalResourceReference, { foreignKey: 'wineryId', as: 'externalResourceReferences' });
            Winery.hasMany(models.ExternalResourceObservation, { foreignKey: 'wineryId', as: 'externalResourceObservations' });
            Winery.hasMany(models.ProjectionIssue, { foreignKey: 'wineryId', as: 'projectionIssues' });
            Winery.hasMany(models.IntegrationConfigurationAuthority, {
                foreignKey: 'wineryId',
                as: 'integrationConfigurationAuthorities'
            });
            Winery.hasMany(models.DataAuthorityPolicySet, { foreignKey: 'wineryId', as: 'dataAuthorityPolicySets' });
            Winery.hasMany(models.DataAuthorityPolicy, { foreignKey: 'wineryId', as: 'dataAuthorityPolicies' });
            Winery.hasMany(models.DataAuthorityPolicySource, { foreignKey: 'wineryId', as: 'dataAuthorityPolicySources' });
            Winery.hasMany(models.IntegrationJob, { foreignKey: 'wineryId', as: 'integrationJobs' });
            Winery.hasMany(models.IntegrationCredential, { foreignKey: 'wineryId', as: 'integrationCredentials' });
            Winery.hasMany(models.IntegrationDomainActivation, { foreignKey: 'wineryId', as: 'integrationDomainActivations' });
            Winery.hasMany(models.Booking, { foreignKey: 'wineryId', as: 'canonicalBookings' });
            Winery.hasMany(models.BookingAreaLink, { foreignKey: 'wineryId', as: 'bookingAreaLinks' });
            Winery.hasMany(models.BookingItem, { foreignKey: 'wineryId', as: 'bookingItems' });
            Winery.hasMany(models.BookingRequirement, { foreignKey: 'wineryId', as: 'bookingRequirements' });
            Winery.hasMany(models.BookingStatusEvent, { foreignKey: 'wineryId', as: 'bookingStatusEvents' });
            Winery.hasMany(models.CanonicalEventOutbox, { foreignKey: 'wineryId', as: 'canonicalEventOutbox' });
            Winery.hasMany(models.CustomerMergeRedirect, { foreignKey: 'wineryId', as: 'customerMergeRedirects' });
            Winery.hasMany(models.CustomerContactPoint, { foreignKey: 'wineryId', as: 'customerContactPoints' });
            Winery.hasMany(models.CustomerAddress, { foreignKey: 'wineryId', as: 'customerAddresses' });
            Winery.hasMany(models.CustomerConsent, { foreignKey: 'wineryId', as: 'customerConsents' });
            Winery.hasMany(models.CustomerLifecycleMilestone, {
                foreignKey: 'wineryId',
                as: 'customerLifecycleMilestones'
            });
            Winery.hasMany(models.WineClubProgram, { foreignKey: 'wineryId', as: 'wineClubPrograms' });
            Winery.hasMany(models.WineClubMembership, { foreignKey: 'wineryId', as: 'wineClubMemberships' });
            Winery.hasMany(models.WineClubMembershipEvent, {
                foreignKey: 'wineryId',
                as: 'wineClubMembershipEvents'
            });
            Winery.hasMany(models.WineClubAllocation, { foreignKey: 'wineryId', as: 'wineClubAllocations' });
            Winery.hasMany(models.WineClubAllocationItem, { foreignKey: 'wineryId', as: 'wineClubAllocationItems' });
            Winery.hasMany(models.SalesOrder, { foreignKey: 'wineryId', as: 'salesOrders' });
            Winery.hasMany(models.SalesOrderLine, { foreignKey: 'wineryId', as: 'salesOrderLines' });
            Winery.hasMany(models.PaymentSummaryEvent, { foreignKey: 'wineryId', as: 'paymentSummaryEvents' });
            Winery.hasMany(models.RefundSummary, { foreignKey: 'wineryId', as: 'refundSummaries' });
            Winery.hasMany(models.BusinessEntityLink, { foreignKey: 'wineryId', as: 'businessEntityLinks' });
            Winery.hasMany(models.BusinessEntityLinkEvidence, { foreignKey: 'wineryId', as: 'businessEntityLinkEvidence' });
            Winery.hasMany(models.CustomerRollupRun, { foreignKey: 'wineryId', as: 'customerRollupRuns' });
            Winery.hasMany(models.CustomerRelationshipRollup, { foreignKey: 'wineryId', as: 'customerRelationshipRollups' });
            Winery.hasMany(models.CustomerMonetaryRollup, { foreignKey: 'wineryId', as: 'customerMonetaryRollups' });
            Winery.hasMany(models.CustomerRollupContribution, { foreignKey: 'wineryId', as: 'customerRollupContributions' });
            Winery.hasMany(models.LocationAreaLink, { foreignKey: 'wineryId', as: 'locationAreaLinks' });
            Winery.hasMany(models.OperationalResourceLink, { foreignKey: 'wineryId', as: 'operationalResourceLinks' });
            Winery.hasMany(models.StaffIdentity, { foreignKey: 'wineryId', as: 'staffIdentities' });
            Winery.hasMany(models.RoleSkillDefinition, { foreignKey: 'wineryId', as: 'roleSkillDefinitions' });
            Winery.hasMany(models.StaffRoleSkill, { foreignKey: 'wineryId', as: 'staffRoleSkills' });
            Winery.hasMany(models.RosterShift, { foreignKey: 'wineryId', as: 'rosterShifts' });
            Winery.hasMany(models.RosterShiftSkill, { foreignKey: 'wineryId', as: 'rosterShiftSkills' });
            Winery.hasMany(models.StaffAvailabilityEvent, {
                foreignKey: 'wineryId',
                as: 'staffAvailabilityEvents'
            });
            Winery.hasMany(models.WorkforceCoverageObservation, {
                foreignKey: 'wineryId',
                as: 'workforceCoverageObservations'
            });
            Winery.hasMany(models.WorkforceDemandMapping, {
                foreignKey: 'wineryId',
                as: 'workforceDemandMappings'
            });
            Winery.hasOne(models.WinerySettings, { foreignKey: 'wineryId', as: 'settings' });
            Winery.hasMany(models.WineryProduct, { foreignKey: 'wineryId', as: 'products' });
            Winery.hasMany(models.WineryContact, { foreignKey: 'wineryId', as: 'contacts' });

            // New Associations
            Winery.hasOne(models.WineryBrandProfile, { foreignKey: 'wineryId', as: 'brandProfile' });
            Winery.hasOne(models.WineryBookingsConfig, { foreignKey: 'wineryId', as: 'bookingsConfig' });
            Winery.hasMany(models.WineryBookingType, { foreignKey: 'wineryId', as: 'bookingTypes' });
            Winery.hasOne(models.WineryPolicyProfile, { foreignKey: 'wineryId', as: 'policyProfile' });
            Winery.hasMany(models.WineryFAQItem, { foreignKey: 'wineryId', as: 'faqs' });
            Winery.hasMany(models.WinerySop, { foreignKey: 'wineryId', as: 'sops' });
            Winery.hasOne(models.WineryIntegrationConfig, { foreignKey: 'wineryId', as: 'integrationConfig' });
            Winery.hasOne(models.WineryBillingProfile, { foreignKey: 'wineryId', as: 'billingProfile' });
            Winery.hasMany(models.UsageEvent, { foreignKey: 'wineryId', as: 'usageEvents' });
            Winery.hasMany(models.UsageCounterBucket, { foreignKey: 'wineryId', as: 'usageCounterBuckets' });
            Winery.hasMany(models.UsageGaugeSnapshot, { foreignKey: 'wineryId', as: 'usageGaugeSnapshots' });
            Winery.hasMany(models.UserActivityDaily, { foreignKey: 'wineryId', as: 'userActivityDays' });
        }
    }

    Winery.init(
        {
            name: { type: DataTypes.STRING, allowNull: false },
            shortName: DataTypes.STRING,
            keyDescriptors: DataTypes.JSON, // Array
            region: { type: DataTypes.STRING, allowNull: true },

            // Internal Contacts
            contactEmail: DataTypes.STRING,
            contactPhone: DataTypes.STRING,

            // Public Contacts
            publicEmail: DataTypes.STRING,
            publicPhone: DataTypes.STRING,
            website: DataTypes.STRING,

            // Address
            addressLine1: DataTypes.STRING,
            addressLine2: DataTypes.STRING,
            suburb: DataTypes.STRING,
            state: DataTypes.STRING,
            postcode: DataTypes.STRING,
            country: { type: DataTypes.STRING, defaultValue: 'Australia' },

            // JSON Configs (Legacy/Simple)
            brandVoiceConfig: DataTypes.JSON, // Deprecated in favor of BrandProfile, but kept for migration safety
            openingHours: DataTypes.JSON,
            socialLinks: DataTypes.JSON,

            timeZone: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Australia/Adelaide' }
        },
        {
            sequelize,
            modelName: 'Winery',
            tableName: 'Wineries',
            timestamps: true
        }
    );
    return Winery;
};
