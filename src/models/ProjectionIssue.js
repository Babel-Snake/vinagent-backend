const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectionIssue extends Model {
    static associate(models) {
      ProjectionIssue.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectionIssue.belongsTo(models.IntegrationConnection, { foreignKey: 'connectionId', as: 'Connection' });
      ProjectionIssue.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'externalResourceReferenceId',
        as: 'ExternalResource'
      });
      ProjectionIssue.belongsTo(models.User, { foreignKey: 'resolvedBy', as: 'Resolver' });
      ProjectionIssue.belongsTo(models.User, { foreignKey: 'acknowledgedBy', as: 'Acknowledger' });
      ProjectionIssue.belongsTo(models.ProjectionIssue, { foreignKey: 'supersedesIssueId', as: 'SupersededIssue' });
      ProjectionIssue.hasMany(models.ProjectionIssue, { foreignKey: 'supersedesIssueId', as: 'SuccessorIssues' });
    }
  }

  ProjectionIssue.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    externalResourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    issueType: { type: DataTypes.STRING(120), allowNull: false },
    fingerprint: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'OPEN' },
    severity: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'WARNING' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    summary: DataTypes.TEXT,
    evidence: DataTypes.JSON,
    candidates: DataTypes.JSON,
    sourceVersion: DataTypes.STRING,
    observationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    detectedAt: { type: DataTypes.DATE, allowNull: false },
    lastObservedAt: { type: DataTypes.DATE, allowNull: false },
    acknowledgedAt: DataTypes.DATE,
    acknowledgedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    resolvedAt: DataTypes.DATE,
    resolvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    resolutionNote: DataTypes.TEXT,
    resolutionMethod: DataTypes.STRING(80),
    resolutionData: DataTypes.JSON,
    supersedesIssueId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ProjectionIssues', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'ProjectionIssue',
    tableName: 'ProjectionIssues',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'fingerprint'], name: 'projection_issues_unique_fingerprint' },
      { fields: ['wineryId', 'status', 'severity', 'lastObservedAt'], name: 'projection_issues_review_queue' },
      { fields: ['wineryId', 'acknowledgedBy', 'acknowledgedAt'], name: 'projection_issues_acknowledgement' },
      { fields: ['externalResourceReferenceId', 'status'], name: 'projection_issues_external_resource' }
    ]
  });

  return ProjectionIssue;
};
