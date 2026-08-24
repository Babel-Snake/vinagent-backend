const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BusinessEntityLink extends Model {
    static associate(models) {
      BusinessEntityLink.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BusinessEntityLink.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      BusinessEntityLink.belongsTo(models.User, { foreignKey: 'confirmedBy', as: 'Confirmer' });
      BusinessEntityLink.belongsTo(models.User, { foreignKey: 'invalidatedBy', as: 'Invalidator' });
      BusinessEntityLink.hasMany(models.BusinessEntityLinkEvidence, { foreignKey: 'businessEntityLinkId', as: 'Evidence' });
    }
  }

  BusinessEntityLink.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    linkKey: { type: DataTypes.STRING(64), allowNull: false },
    sourceType: { type: DataTypes.STRING(120), allowNull: false },
    sourceId: { type: DataTypes.INTEGER, allowNull: false },
    targetType: { type: DataTypes.STRING(120), allowNull: false },
    targetId: { type: DataTypes.INTEGER, allowNull: false },
    relationshipType: { type: DataTypes.STRING(120), allowNull: false },
    confirmationStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNREVIEWED' },
    confidence: DataTypes.DECIMAL(5, 4),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    validFrom: { type: DataTypes.DATE, allowNull: false },
    validTo: DataTypes.DATE,
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    confirmedAt: DataTypes.DATE,
    invalidatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    invalidatedAt: DataTypes.DATE,
    invalidationReason: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'BusinessEntityLink',
    tableName: 'BusinessEntityLinks',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'linkKey'], name: 'business_entity_links_unique_key' },
      { fields: ['wineryId', 'sourceType', 'sourceId', 'isActive'], name: 'business_entity_links_source' },
      { fields: ['wineryId', 'targetType', 'targetId', 'isActive'], name: 'business_entity_links_target' },
      { fields: ['wineryId', 'relationshipType', 'confirmationStatus'], name: 'business_entity_links_review' }
    ]
  });

  return BusinessEntityLink;
};
