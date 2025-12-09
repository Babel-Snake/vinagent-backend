'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WinerySettings extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            WinerySettings.belongsTo(models.Winery, {
                foreignKey: 'wineryId',
                as: 'winery'
            });
        }
    }
    WinerySettings.init({
        wineryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        tier: {
            type: DataTypes.ENUM('BASIC', 'ADVANCED'),
            defaultValue: 'BASIC'
        },
        enableBookingModule: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        enableWineClubModule: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        enableOrdersModule: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        enableSecureLinks: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        enableInsights: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        enableVoice: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'WinerySettings',
    });
    return WinerySettings;
};
