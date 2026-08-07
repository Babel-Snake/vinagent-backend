const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalRecordArea extends Model {
    static associate(models) {
      OperationalRecordArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalRecordArea.belongsTo(models.OperationalRecord, { foreignKey: 'recordId' });
      OperationalRecordArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  OperationalRecordArea.init({
    relationshipType: {
      type: DataTypes.ENUM('PRIMARY', 'LINKED'),
      allowNull: false,
      defaultValue: 'LINKED'
    },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    recordId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalRecords', key: 'id' } },
    areaId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalRecordArea',
    tableName: 'OperationalRecordAreas',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['recordId', 'areaId'] },
      { fields: ['wineryId', 'areaId', 'recordId'] }
    ]
  });

  return OperationalRecordArea;
};
