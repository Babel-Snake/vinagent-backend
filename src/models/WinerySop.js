'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WinerySop extends Model {
        static associate(models) {
            WinerySop.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            WinerySop.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
        }
    }
    WinerySop.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false },
        areaId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'OperationalAreas', key: 'id' }
        },
        title: { type: DataTypes.STRING, allowNull: false },
        body: { type: DataTypes.TEXT, allowNull: false },
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        sequelize,
        modelName: 'WinerySop',
        tableName: 'WinerySops',
        indexes: [{ fields: ['wineryId', 'areaId', 'isActive'] }]
    });
    return WinerySop;
};
