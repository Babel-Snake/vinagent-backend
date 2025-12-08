const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Winery extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            Winery.hasMany(models.User, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Member, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Message, { foreignKey: 'wineryId' });
            Winery.hasMany(models.Task, { foreignKey: 'wineryId' });
        }
    }

    Winery.init(
        {
            name: {
                type: DataTypes.STRING,
                allowNull: false
            },
            region: {
                type: DataTypes.STRING,
                allowNull: true
            },
            contactEmail: {
                type: DataTypes.STRING,
                allowNull: true
            },
            contactPhone: {
                type: DataTypes.STRING,
                allowNull: true
            },
            brandVoiceConfig: {
                type: DataTypes.JSON,
                allowNull: true
            },
            timeZone: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'Australia/Adelaide'
            }
        },
        {
            sequelize,
            modelName: 'Winery',
            tableName: 'Wineries',
            timestamps: true
        }
    );
    return Winery;
};
