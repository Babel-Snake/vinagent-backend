'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryFAQItem extends Model {
        static associate(models) {
            WineryFAQItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            WineryFAQItem.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
        }
    }
    WineryFAQItem.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        areaId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'OperationalAreas', key: 'id' }
        },
        question: { type: DataTypes.STRING, allowNull: false },
        answer: { type: DataTypes.TEXT, allowNull: false },
        tags: DataTypes.JSON, // Array of strings
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WineryFAQItem',
        tableName: 'WineryFAQItems', // Explicit table name to match migration rename
        indexes: [{ fields: ['wineryId', 'areaId', 'isActive'] }]
    });
    return WineryFAQItem;
};
