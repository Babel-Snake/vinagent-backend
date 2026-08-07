const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalRequest extends Model {
    static associate(models) {
      OperationalRequest.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalRequest.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      OperationalRequest.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      OperationalRequest.belongsTo(models.User, { foreignKey: 'requestedFromUserId', as: 'RequestedFrom' });
      OperationalRequest.belongsTo(models.User, { foreignKey: 'decisionBy', as: 'DecisionMaker' });
      OperationalRequest.belongsTo(models.User, { foreignKey: 'confirmedBy', as: 'Confirmer' });
      OperationalRequest.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      OperationalRequest.hasMany(models.OperationalRequestArea, { foreignKey: 'requestId', as: 'AreaLinks' });
      OperationalRequest.belongsToMany(models.OperationalArea, {
        through: models.OperationalRequestArea,
        foreignKey: 'requestId',
        otherKey: 'areaId',
        as: 'OperationalAreas'
      });
    }
  }

  OperationalRequest.init({
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    originalText: { type: DataTypes.TEXT, allowNull: true },
    subtype: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high'),
      allowNull: false,
      defaultValue: 'normal'
    },
    response: { type: DataTypes.TEXT, allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    sourceType: {
      type: DataTypes.ENUM('MANUAL', 'INTEGRATION', 'AI'),
      allowNull: false,
      defaultValue: 'MANUAL'
    },
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
      defaultValue: 'REQUEST'
    },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    requestedFromUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    decisionBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    confirmedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    confirmedAt: { type: DataTypes.DATE, allowNull: false },
    sourceEventId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationEvents', key: 'id' }
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'OperationalRequest',
    tableName: 'OperationalRequests',
    timestamps: true,
    indexes: [
      { fields: ['wineryId', 'status', 'createdAt'] },
      { fields: ['wineryId', 'areaScope'] },
      { fields: ['wineryId', 'requestedFromUserId', 'status'] }
    ]
  });

  return OperationalRequest;
};
