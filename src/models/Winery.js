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
            Winery.hasOne(models.WinerySettings, { foreignKey: 'wineryId', as: 'settings' });
            Winery.hasMany(models.WineryProduct, { foreignKey: 'wineryId', as: 'products' });

            // New Associations
            Winery.hasOne(models.WineryBrandProfile, { foreignKey: 'wineryId', as: 'brandProfile' });
            Winery.hasOne(models.WineryBookingsConfig, { foreignKey: 'wineryId', as: 'bookingsConfig' });
            Winery.hasMany(models.WineryBookingType, { foreignKey: 'wineryId', as: 'bookingTypes' });
            Winery.hasOne(models.WineryPolicyProfile, { foreignKey: 'wineryId', as: 'policyProfile' });
            Winery.hasMany(models.WineryFAQItem, { foreignKey: 'wineryId', as: 'faqs' });
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
