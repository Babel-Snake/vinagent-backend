'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryFAQItem extends Model {
        static associate(models) {
            WineryFAQItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryFAQItem.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        question: { type: DataTypes.STRING, allowNull: false },
        answer: { type: DataTypes.TEXT, allowNull: false },
        tags: DataTypes.JSON, // Array of strings
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WineryFAQItem',
        tableName: 'WineryFAQItems' // Explicit table name to match migration rename
    });
    return WineryFAQItem;
};
