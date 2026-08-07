const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalRequestArea extends Model {
    static associate(models) {
      OperationalRequestArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalRequestArea.belongsTo(models.OperationalRequest, { foreignKey: 'requestId' });
      OperationalRequestArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  OperationalRequestArea.init({
    relationshipType: {
      type: DataTypes.ENUM('PRIMARY', 'LINKED'),
      allowNull: false,
      defaultValue: 'LINKED'
    },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    requestId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalRequests', key: 'id' } },
    areaId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalRequestArea',
    tableName: 'OperationalRequestAreas',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['requestId', 'areaId'] },
      { fields: ['wineryId', 'areaId', 'requestId'] }
    ]
  });

  return OperationalRequestArea;
};
