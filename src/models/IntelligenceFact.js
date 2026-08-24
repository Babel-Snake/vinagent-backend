const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntelligenceFact extends Model {
    static associate(models) {
      IntelligenceFact.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntelligenceFact.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      IntelligenceFact.belongsTo(models.IntegrationConnection, {
        foreignKey: 'sourceConnectionId',
        as: 'SourceConnection'
      });
      IntelligenceFact.belongsTo(models.IntegrationEvent, {
        foreignKey: 'sourceEventId',
        as: 'SourceEvent'
      });
      IntelligenceFact.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      IntelligenceFact.belongsTo(models.IntelligenceFactMaterializationRun, {
        foreignKey: 'materializationRunId',
        as: 'MaterializationRun'
      });
      IntelligenceFact.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  IntelligenceFact.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    areaId: DataTypes.INTEGER,
    subjectType: { type: DataTypes.STRING(120), allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
    factKey: { type: DataTypes.STRING(160), allowNull: false },
    factIdentityKey: { type: DataTypes.STRING(64), allowNull: false },
    factVersionKey: { type: DataTypes.STRING(64), allowNull: false },
    valueType: { type: DataTypes.STRING(20), allowNull: false },
    valueJson: { type: DataTypes.JSON, allowNull: false },
    unit: DataTypes.STRING(40),
    valueSchemaVersion: { type: DataTypes.STRING(40), allowNull: false },
    qualityClass: { type: DataTypes.STRING(40), allowNull: false },
    confidence: DataTypes.DECIMAL(5, 4),
    effectiveFrom: DataTypes.DATE,
    effectiveTo: DataTypes.DATE,
    observedAt: { type: DataTypes.DATE, allowNull: false },
    staleAt: DataTypes.DATE,
    supersededAt: DataTypes.DATE,
    sourceConnectionId: DataTypes.INTEGER,
    sourceEventId: DataTypes.INTEGER,
    sourceReferenceId: DataTypes.INTEGER,
    derivationType: { type: DataTypes.STRING(40), allowNull: false },
    derivationKey: { type: DataTypes.STRING(160), allowNull: false },
    derivationVersion: { type: DataTypes.STRING(80), allowNull: false },
    evidence: DataTypes.JSON,
    sensitivity: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'INTERNAL' },
    materializationRunId: DataTypes.INTEGER,
    createdBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'IntelligenceFact',
    tableName: 'IntelligenceFacts',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['wineryId', 'factVersionKey'], name: 'intelligence_facts_unique_version' },
      {
        fields: ['wineryId', 'subjectType', 'subjectId', 'factKey', 'supersededAt'],
        name: 'intelligence_facts_current_subject'
      },
      { fields: ['wineryId', 'factKey', 'qualityClass', 'staleAt'], name: 'intelligence_facts_quality_freshness' },
      { fields: ['wineryId', 'areaId', 'factKey', 'supersededAt'], name: 'intelligence_facts_area' },
      { fields: ['sourceReferenceId', 'createdAt'], name: 'intelligence_facts_source_reference' },
      { fields: ['materializationRunId', 'createdAt'], name: 'intelligence_facts_run' }
    ]
  });

  return IntelligenceFact;
};
