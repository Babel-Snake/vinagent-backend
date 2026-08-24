const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineClubAllocation extends Model {
    static associate(models) {
      WineClubAllocation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineClubAllocation.belongsTo(models.WineClubMembership, { foreignKey: 'membershipId', as: 'Membership' });
      WineClubAllocation.belongsTo(models.WineClubProgram, { foreignKey: 'programId', as: 'Program' });
      WineClubAllocation.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      WineClubAllocation.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
      WineClubAllocation.hasMany(models.WineClubAllocationItem, { foreignKey: 'allocationId', as: 'Items' });
      WineClubAllocation.belongsTo(models.SalesOrder, { foreignKey: 'salesOrderId', as: 'SalesOrder' });
      WineClubAllocation.hasMany(models.Shipment, { foreignKey: 'wineClubAllocationId', as: 'Shipments' });
    }
  }

  WineClubAllocation.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    membershipId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'WineClubMemberships', key: 'id' }
    },
    programId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'WineClubPrograms', key: 'id' } },
    primarySourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    authorityConnectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    cycleCode: { type: DataTypes.STRING(120), allowNull: false },
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: DataTypes.STRING(120),
    opensAt: DataTypes.DATE,
    closesAt: DataTypes.DATE,
    chargesAt: DataTypes.DATE,
    fulfilsAt: DataTypes.DATE,
    fulfilmentMethod: DataTypes.STRING(80),
    currency: DataTypes.STRING(3),
    totalMinor: DataTypes.INTEGER,
    salesOrderId: DataTypes.INTEGER,
    sourceRevision: DataTypes.STRING(255),
    sourceUpdatedAt: DataTypes.DATE,
    observedAt: { type: DataTypes.DATE, allowNull: false },
    projectionQuality: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'WineClubAllocation',
    tableName: 'WineClubAllocations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'membershipId', 'cycleCode'], name: 'wine_club_allocations_unique_cycle' },
      { unique: true, fields: ['primarySourceReferenceId'], name: 'wine_club_allocations_unique_source' },
      { fields: ['wineryId', 'canonicalStatus', 'chargesAt'], name: 'wine_club_allocations_status_charge' }
    ]
  });

  return WineClubAllocation;
};
