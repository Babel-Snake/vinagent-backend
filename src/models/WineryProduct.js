'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryProduct extends Model {
        static associate(models) {
            WineryProduct.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryProduct.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        category: DataTypes.STRING,
        vintage: DataTypes.STRING,
        price: DataTypes.DECIMAL(10, 2),
        stockStatus: {
            type: DataTypes.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'),
            defaultValue: 'IN_STOCK'
        },
        tastingNotes: DataTypes.TEXT,
        keySellingPoints: DataTypes.JSON,
        pairingSuggestions: DataTypes.TEXT,
        isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WineryProduct',
    });
    return WineryProduct;
};
