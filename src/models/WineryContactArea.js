const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineryContactArea extends Model {
    static associate(models) {
      WineryContactArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineryContactArea.belongsTo(models.WineryContact, { foreignKey: 'contactId' });
      WineryContactArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  WineryContactArea.init(
    {
      relationshipType: {
        type: DataTypes.ENUM('PRIMARY', 'LINKED'),
        allowNull: false,
        defaultValue: 'LINKED'
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'WineryContacts', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'WineryContactArea',
      tableName: 'WineryContactAreas',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['contactId', 'areaId'] },
        { fields: ['wineryId', 'areaId', 'contactId'] },
        { fields: ['contactId', 'relationshipType'] }
      ]
    }
  );

  return WineryContactArea;
};
