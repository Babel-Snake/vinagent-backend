const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerAddress extends Model {
    static associate(models) {
      CustomerAddress.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerAddress.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerAddress.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      CustomerAddress.hasMany(models.Shipment, { foreignKey: 'restrictedAddressId', as: 'Shipments' });
    }
  }

  CustomerAddress.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    addressType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PRIMARY' },
    fingerprint: { type: DataTypes.STRING(64), allowNull: false },
    addressLine1: DataTypes.STRING,
    addressLine2: DataTypes.STRING,
    suburb: DataTypes.STRING(120),
    state: DataTypes.STRING(120),
    postcode: DataTypes.STRING(24),
    country: DataTypes.STRING(120),
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isValid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    validFrom: DataTypes.DATE,
    validTo: DataTypes.DATE,
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    sourceKind: { type: DataTypes.STRING(80), allowNull: false },
    sourceKey: { type: DataTypes.STRING(180), allowNull: false }
  }, {
    sequelize,
    modelName: 'CustomerAddress',
    tableName: 'CustomerAddresses',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'memberId', 'fingerprint'],
        name: 'customer_addresses_unique_fingerprint'
      },
      { unique: true, fields: ['wineryId', 'sourceKey'], name: 'customer_addresses_unique_source' },
      { fields: ['wineryId', 'memberId', 'isPrimary', 'isValid'], name: 'customer_addresses_member' }
    ]
  });

  return CustomerAddress;
};
