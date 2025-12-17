'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryBookingsConfig extends Model {
        static associate(models) {
            WineryBookingsConfig.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryBookingsConfig.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        walkInsAllowed: { type: DataTypes.BOOLEAN, defaultValue: true },
        walkInNotes: DataTypes.TEXT,
        groupBookingThreshold: { type: DataTypes.INTEGER, defaultValue: 8 },
        leadTimeHours: { type: DataTypes.INTEGER, defaultValue: 24 },
        cancellationPolicyText: DataTypes.TEXT,
        kidsPolicy: DataTypes.TEXT,
        petsPolicy: DataTypes.TEXT,
        defaultResponseStrategy: { type: DataTypes.ENUM('confirm', 'create_task'), defaultValue: 'create_task' }
    }, {
        sequelize,
        modelName: 'WineryBookingsConfig',
    });
    return WineryBookingsConfig;
};
