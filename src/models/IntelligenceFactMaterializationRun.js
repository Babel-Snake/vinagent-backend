const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntelligenceFactMaterializationRun extends Model {
    static associate(models) {
      IntelligenceFactMaterializationRun.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntelligenceFactMaterializationRun.belongsTo(models.User, {
        foreignKey: 'requestedBy',
        as: 'Requester'
      });
      IntelligenceFactMaterializationRun.hasMany(models.IntelligenceFact, {
        foreignKey: 'materializationRunId',
        as: 'Facts'
      });
    }
  }

  IntelligenceFactMaterializationRun.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    runKey: { type: DataTypes.STRING(64), allowNull: false },
    requestHash: { type: DataTypes.STRING(64), allowNull: false },
    materializerKey: { type: DataTypes.STRING(160), allowNull: false },
    materializerVersion: { type: DataTypes.STRING(80), allowNull: false },
    subjectType: { type: DataTypes.STRING(120), allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
    factsCreated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    factsSuperseded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duplicateFacts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: DataTypes.DATE,
    errorCode: DataTypes.STRING(120),
    errorSummary: DataTypes.STRING(500),
    reason: { type: DataTypes.STRING(1000), allowNull: false },
    requestedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'IntelligenceFactMaterializationRun',
    tableName: 'IntelligenceFactMaterializationRuns',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'runKey'], name: 'intelligence_fact_runs_unique_request' },
      { fields: ['wineryId', 'materializerKey', 'status', 'startedAt'], name: 'intelligence_fact_runs_status' },
      { fields: ['wineryId', 'subjectType', 'subjectId', 'startedAt'], name: 'intelligence_fact_runs_subject' }
    ]
  });

  return IntelligenceFactMaterializationRun;
};
