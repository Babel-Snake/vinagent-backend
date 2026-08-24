const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerContactPoint extends Model {
    static associate(models) {
      CustomerContactPoint.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerContactPoint.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerContactPoint.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
    }
  }

  CustomerContactPoint.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    contactType: { type: DataTypes.STRING(24), allowNull: false },
    normalizedValue: { type: DataTypes.STRING(320), allowNull: false },
    displayValue: { type: DataTypes.STRING(320), allowNull: false },
    verificationStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    verifiedAt: DataTypes.DATE,
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isValid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    validFrom: DataTypes.DATE,
    validTo: DataTypes.DATE,
    suppressedAt: DataTypes.DATE,
    suppressionReason: DataTypes.STRING(160),
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    sourceKind: { type: DataTypes.STRING(80), allowNull: false },
    sourceKey: { type: DataTypes.STRING(180), allowNull: false }
  }, {
    sequelize,
    modelName: 'CustomerContactPoint',
    tableName: 'CustomerContactPoints',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'memberId', 'contactType', 'normalizedValue'],
        name: 'customer_contact_points_unique_value'
      },
      { unique: true, fields: ['wineryId', 'sourceKey'], name: 'customer_contact_points_unique_source' },
      {
        fields: ['wineryId', 'contactType', 'normalizedValue', 'isValid'],
        name: 'customer_contact_points_identity_lookup'
      },
      { fields: ['wineryId', 'memberId', 'isPrimary'], name: 'customer_contact_points_member' }
    ]
  });

  return CustomerContactPoint;
};
