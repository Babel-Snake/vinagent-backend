const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalIntelligenceSignal extends Model {
    static associate(models) {
      OperationalIntelligenceSignal.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalIntelligenceSignal.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      OperationalIntelligenceSignal.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      OperationalIntelligenceSignal.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'Reviewer' });
      OperationalIntelligenceSignal.belongsTo(models.User, { foreignKey: 'reviewOwnerUserId', as: 'ReviewOwner' });
      OperationalIntelligenceSignal.belongsTo(models.Task, { foreignKey: 'actionTaskId', as: 'ActionTask' });
    }
  }

  OperationalIntelligenceSignal.init({
    signalType: {
      type: DataTypes.ENUM(
        'REQUEST_AGING',
        'RECURRENCE',
        'CLASSIFICATION_CORRECTION',
        'CONVERSION_OUTCOME',
        'NOTICE_ACKNOWLEDGEMENT',
        'TREND'
      ),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_CREATED'),
      allowNull: false,
      defaultValue: 'OPEN'
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical'),
      allowNull: false,
      defaultValue: 'info'
    },
    title: { type: DataTypes.STRING, allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: true },
    fingerprint: { type: DataTypes.STRING, allowNull: false },
    dedupeKey: { type: DataTypes.STRING, allowNull: true },
    evidence: { type: DataTypes.JSON, allowNull: true },
    suggestedAction: { type: DataTypes.TEXT, allowNull: true },
    periodStart: { type: DataTypes.DATE, allowNull: true },
    periodEnd: { type: DataTypes.DATE, allowNull: true },
    reviewNote: { type: DataTypes.TEXT, allowNull: true },
    reviewDueAt: { type: DataTypes.DATE, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    lastMaterializedAt: { type: DataTypes.DATE, allowNull: true },
    materializationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    areaId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'OperationalAreas', key: 'id' } },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    reviewedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    reviewOwnerUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    actionTaskId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Tasks', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalIntelligenceSignal',
    tableName: 'OperationalIntelligenceSignals',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'fingerprint'] },
      { fields: ['wineryId', 'dedupeKey', 'status'] },
      { fields: ['wineryId', 'reviewOwnerUserId', 'reviewDueAt'] },
      { fields: ['wineryId', 'status', 'createdAt'] },
      { fields: ['wineryId', 'signalType', 'createdAt'] },
      { fields: ['wineryId', 'areaId', 'createdAt'] }
    ]
  });

  return OperationalIntelligenceSignal;
};
