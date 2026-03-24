'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryContact extends Model {
        static associate(models) {
            WineryContact.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryContact.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        role: { type: DataTypes.STRING, allowNull: false },
        email: DataTypes.STRING,
        phone: DataTypes.STRING,
        layer: DataTypes.STRING,
        notes: DataTypes.TEXT,
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WineryContact',
    });
    return WineryContact;
};
