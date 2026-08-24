const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineClubMembershipEvent extends Model {
    static associate(models) {
      WineClubMembershipEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineClubMembershipEvent.belongsTo(models.WineClubMembership, { foreignKey: 'membershipId', as: 'Membership' });
      WineClubMembershipEvent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      WineClubMembershipEvent.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }

  WineClubMembershipEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    membershipId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'WineClubMemberships', key: 'id' }
    },
    eventKey: { type: DataTypes.STRING(180), allowNull: false },
    eventType: { type: DataTypes.STRING(80), allowNull: false },
    fromStatus: DataTypes.STRING(40),
    toStatus: DataTypes.STRING(40),
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    reason: DataTypes.STRING(255),
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'IntegrationEvents', key: 'id' } },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'WineClubMembershipEvent',
    tableName: 'WineClubMembershipEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['membershipId', 'eventKey'], name: 'wine_club_membership_events_unique' },
      { fields: ['wineryId', 'membershipId', 'effectiveAt'], name: 'wine_club_membership_events_timeline' }
    ]
  });

  return WineClubMembershipEvent;
};
