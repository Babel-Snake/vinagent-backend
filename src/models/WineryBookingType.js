'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryBookingType extends Model {
        static associate(models) {
            WineryBookingType.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryBookingType.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        durationMinutes: DataTypes.INTEGER,
        priceCents: { type: DataTypes.INTEGER, defaultValue: 0 },
        currency: { type: DataTypes.STRING, defaultValue: 'AUD' },
        minGuests: { type: DataTypes.INTEGER, defaultValue: 1 },
        maxGuests: DataTypes.INTEGER,
        daysAvailable: DataTypes.JSON,
        requiresDeposit: { type: DataTypes.BOOLEAN, defaultValue: false },
        depositCents: { type: DataTypes.INTEGER, defaultValue: 0 },
        notesForGuests: DataTypes.TEXT,
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WineryBookingType',
    });
    return WineryBookingType;
};
