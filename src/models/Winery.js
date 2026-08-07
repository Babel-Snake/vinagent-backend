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
