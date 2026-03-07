'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryIntegrationConfig extends Model {
        static associate(models) {
            WineryIntegrationConfig.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryIntegrationConfig.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        smsProvider: { type: DataTypes.STRING, defaultValue: 'twilio' },
        smsFromNumber: DataTypes.STRING,
        emailProvider: { type: DataTypes.STRING, defaultValue: 'sendgrid' },
        emailFromAddress: DataTypes.STRING,
        channelsEnabled: DataTypes.JSON,
        kioskModeEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
        posProvider: { type: DataTypes.STRING, defaultValue: 'other' },
        crmProvider: { type: DataTypes.STRING, defaultValue: 'other' },
        bookingProvider: { type: DataTypes.STRING, defaultValue: 'other' },
        deliveryProvider: { type: DataTypes.STRING, defaultValue: 'other' },
        planTier: { type: DataTypes.ENUM('basic', 'advanced'), defaultValue: 'basic' }
    }, {
        sequelize,
        modelName: 'WineryIntegrationConfig',
    });
    return WineryIntegrationConfig;
};
