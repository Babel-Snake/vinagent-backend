const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalAreaProfile extends Model {
    static associate(models) {
      OperationalAreaProfile.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalAreaProfile.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  OperationalAreaProfile.init(
    {
      publicEmail: { type: DataTypes.STRING, allowNull: true },
      publicPhone: { type: DataTypes.STRING, allowNull: true },
      openingHoursText: { type: DataTypes.TEXT, allowNull: true },
      guestDirections: { type: DataTypes.TEXT, allowNull: true },
      serviceNotes: { type: DataTypes.TEXT, allowNull: true },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'OperationalAreas', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'OperationalAreaProfile',
      tableName: 'OperationalAreaProfiles',
      timestamps: true,
      indexes: [{ unique: true, fields: ['areaId'] }, { fields: ['wineryId', 'areaId'] }]
    }
  );

  return OperationalAreaProfile;
};
