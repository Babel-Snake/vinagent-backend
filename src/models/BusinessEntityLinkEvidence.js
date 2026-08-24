const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BusinessEntityLinkEvidence extends Model {
    static associate(models) {
      BusinessEntityLinkEvidence.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BusinessEntityLinkEvidence.belongsTo(models.BusinessEntityLink, {
        foreignKey: 'businessEntityLinkId',
        as: 'BusinessEntityLink'
      });
      BusinessEntityLinkEvidence.belongsTo(models.IntegrationConnection, {
        foreignKey: 'sourceConnectionId',
        as: 'SourceConnection'
      });
      BusinessEntityLinkEvidence.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
      BusinessEntityLinkEvidence.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      BusinessEntityLinkEvidence.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  BusinessEntityLinkEvidence.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    businessEntityLinkId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'BusinessEntityLinks', key: 'id' }
    },
    evidenceKey: { type: DataTypes.STRING(180), allowNull: false },
    derivationType: { type: DataTypes.STRING(40), allowNull: false },
    derivationVersion: DataTypes.STRING(120),
    evidenceSummary: { type: DataTypes.STRING(1000), allowNull: false },
    evidenceHash: { type: DataTypes.STRING(64), allowNull: false },
    confidence: DataTypes.DECIMAL(5, 4),
    sourceConnectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    metadata: DataTypes.JSON,
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    createdAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'BusinessEntityLinkEvidence',
    tableName: 'BusinessEntityLinkEvidence',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['businessEntityLinkId', 'evidenceKey'], name: 'business_entity_link_evidence_unique' },
      { fields: ['wineryId', 'sourceReferenceId'], name: 'business_entity_link_evidence_reference' },
      { fields: ['wineryId', 'observedAt'], name: 'business_entity_link_evidence_observed' }
    ]
  });

  return BusinessEntityLinkEvidence;
};
