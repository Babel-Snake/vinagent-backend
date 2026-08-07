const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalRecord extends Model {
    static associate(models) {
      OperationalRecord.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalRecord.belongsTo(models.Member, { foreignKey: 'memberId' });
      OperationalRecord.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      OperationalRecord.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      OperationalRecord.belongsTo(models.User, { foreignKey: 'confirmedBy', as: 'Confirmer' });
      OperationalRecord.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      OperationalRecord.hasMany(models.OperationalRecordArea, { foreignKey: 'recordId', as: 'AreaLinks' });
      OperationalRecord.belongsToMany(models.OperationalArea, {
        through: models.OperationalRecordArea,
        foreignKey: 'recordId',
        otherKey: 'areaId',
        as: 'OperationalAreas'
      });
      OperationalRecord.hasMany(models.OperationalRecordRecipient, { foreignKey: 'recordId', as: 'RecipientLinks' });
      OperationalRecord.belongsToMany(models.User, {
        through: models.OperationalRecordRecipient,
        foreignKey: 'recordId',
        otherKey: 'userId',
        as: 'Recipients'
      });
    }
  }

  OperationalRecord.init({
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    originalText: { type: DataTypes.TEXT, allowNull: true },
    recordType: { type: DataTypes.STRING, allowNull: true },
    sourceType: {
      type: DataTypes.ENUM('MANUAL', 'INTEGRATION', 'AI'),
      allowNull: false,
      defaultValue: 'MANUAL'
    },
    sourceReference: { type: DataTypes.STRING, allowNull: true },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
    areaScope: {
      type: DataTypes.ENUM('ORGANISATION', 'AREAS'),
      allowNull: false,
      defaultValue: 'ORGANISATION'
    },
    aiSuggestedType: {
      type: DataTypes.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'),
      allowNull: true
    },
    aiConfidence: { type: DataTypes.DECIMAL(5, 4), allowNull: true },
    aiSuggestion: { type: DataTypes.JSON, allowNull: true },
    humanConfirmedType: {
      type: DataTypes.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'),
      allowNull: false,
      defaultValue: 'NOTE'
    },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Members', key: 'id' } },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    confirmedAt: { type: DataTypes.DATE, allowNull: false },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    createdBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    updatedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalRecord',
    tableName: 'OperationalRecords',
    timestamps: true,
    indexes: [
      { fields: ['wineryId', 'occurredAt'] },
      { fields: ['wineryId', 'areaScope'] },
      { fields: ['wineryId', 'memberId', 'occurredAt'] }
    ]
  });

  return OperationalRecord;
};
