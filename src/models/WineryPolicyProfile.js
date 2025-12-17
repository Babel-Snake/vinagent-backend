'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryPolicyProfile extends Model {
        static associate(models) {
            WineryPolicyProfile.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryPolicyProfile.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        shippingTimeframesText: DataTypes.TEXT,
        shippingRegions: DataTypes.JSON,
        returnsRefundsPolicyText: DataTypes.TEXT,
        wineClubSummary: DataTypes.TEXT,
        accessibilityNotes: DataTypes.TEXT,
        eventPolicy: DataTypes.TEXT
    }, {
        sequelize,
        modelName: 'WineryPolicyProfile',
    });
    return WineryPolicyProfile;
};
