const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineClubMembership extends Model {
    static associate(models) {
      WineClubMembership.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineClubMembership.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      WineClubMembership.belongsTo(models.WineClubProgram, { foreignKey: 'programId', as: 'Program' });
      WineClubMembership.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      WineClubMembership.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
      WineClubMembership.hasMany(models.WineClubMembershipEvent, { foreignKey: 'membershipId', as: 'Events' });
      WineClubMembership.hasMany(models.WineClubAllocation, { foreignKey: 'membershipId', as: 'Allocations' });
    }
  }

  WineClubMembership.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
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
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: DataTypes.STRING(120),
    joinedAt: DataTypes.DATE,
    activatedAt: DataTypes.DATE,
    pausedAt: DataTypes.DATE,
    nextReviewAt: DataTypes.DATE,
    nextChargeAt: DataTypes.DATE,
    cancelledAt: DataTypes.DATE,
    endedAt: DataTypes.DATE,
    statusReason: DataTypes.STRING(255),
    preferences: DataTypes.JSON,
    fulfilmentMethod: DataTypes.STRING(80),
    sourceRevision: DataTypes.STRING(255),
    sourceUpdatedAt: DataTypes.DATE,
    observedAt: { type: DataTypes.DATE, allowNull: false },
    projectionQuality: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'WineClubMembership',
    tableName: 'WineClubMemberships',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'programId', 'memberId'], name: 'wine_club_memberships_unique_member' },
      { unique: true, fields: ['primarySourceReferenceId'], name: 'wine_club_memberships_unique_source' },
      { fields: ['wineryId', 'canonicalStatus', 'nextChargeAt'], name: 'wine_club_memberships_status_charge' },
      { fields: ['wineryId', 'memberId', 'canonicalStatus'], name: 'wine_club_memberships_member' }
    ]
  });

  return WineClubMembership;
};
