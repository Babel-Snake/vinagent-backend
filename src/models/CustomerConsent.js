const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerConsent extends Model {
    static associate(models) {
      CustomerConsent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerConsent.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerConsent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'evidenceReferenceId',
        as: 'EvidenceReference'
      });
      CustomerConsent.belongsTo(models.CustomerConsent, { foreignKey: 'supersedesConsentId', as: 'SupersededConsent' });
      CustomerConsent.hasMany(models.CustomerConsent, { foreignKey: 'supersedesConsentId', as: 'SuccessorConsents' });
      CustomerConsent.belongsTo(models.User, { foreignKey: 'recordedBy', as: 'Recorder' });
    }
  }

  CustomerConsent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    channel: { type: DataTypes.STRING(40), allowNull: false },
    purpose: { type: DataTypes.STRING(80), allowNull: false },
    state: { type: DataTypes.STRING(40), allowNull: false },
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    expiresAt: DataTypes.DATE,
    collectionSource: { type: DataTypes.STRING(120), allowNull: false },
    evidenceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    supersedesConsentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'CustomerConsents', key: 'id' }
    },
    recordedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    sourceKey: { type: DataTypes.STRING(180), allowNull: false },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'CustomerConsent',
    tableName: 'CustomerConsents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['wineryId', 'sourceKey'], name: 'customer_consents_unique_source' },
      {
        fields: ['wineryId', 'memberId', 'channel', 'purpose', 'effectiveAt'],
        name: 'customer_consents_timeline'
      },
      { fields: ['supersedesConsentId'], name: 'customer_consents_supersedes' }
    ]
  });

  return CustomerConsent;
};
