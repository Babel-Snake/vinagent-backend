const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalRecordRecipient extends Model {
    static associate(models) {
      OperationalRecordRecipient.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalRecordRecipient.belongsTo(models.OperationalRecord, { foreignKey: 'recordId' });
      OperationalRecordRecipient.belongsTo(models.User, { foreignKey: 'userId', as: 'Recipient' });
    }
  }

  OperationalRecordRecipient.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    recordId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'OperationalRecords', key: 'id' }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'OperationalRecordRecipient',
    tableName: 'OperationalRecordRecipients',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['recordId', 'userId'] },
      { fields: ['wineryId', 'userId', 'recordId'] }
    ]
  });

  return OperationalRecordRecipient;
};
