const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalAreaBookingsConfig extends Model {
    static associate(models) {
      OperationalAreaBookingsConfig.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalAreaBookingsConfig.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  OperationalAreaBookingsConfig.init(
    {
      walkInsAllowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      walkInNotes: { type: DataTypes.TEXT, allowNull: true },
      groupBookingThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      leadTimeHours: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 24 },
      cancellationPolicyText: { type: DataTypes.TEXT, allowNull: true },
      kidsPolicy: { type: DataTypes.TEXT, allowNull: true },
      petsPolicy: { type: DataTypes.TEXT, allowNull: true },
      defaultResponseStrategy: {
        type: DataTypes.ENUM('confirm', 'create_task'),
        allowNull: false,
        defaultValue: 'create_task'
      },
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
      modelName: 'OperationalAreaBookingsConfig',
      tableName: 'OperationalAreaBookingsConfigs',
      timestamps: true,
      indexes: [{ unique: true, fields: ['areaId'] }, { fields: ['wineryId', 'areaId'] }]
    }
  );

  return OperationalAreaBookingsConfig;
};
