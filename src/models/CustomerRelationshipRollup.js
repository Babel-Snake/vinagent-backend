const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerRelationshipRollup extends Model {
    static associate(models) {
      CustomerRelationshipRollup.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerRelationshipRollup.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerRelationshipRollup.belongsTo(models.CustomerRollupRun, { foreignKey: 'lastRunId', as: 'LastRun' });
    }
  }

  CustomerRelationshipRollup.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    lastRunId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'CustomerRollupRuns', key: 'id' } },
    activeClubMembershipCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isCurrentClubMember: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    completedBookingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    purchaseOrderCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastVisitAt: DataTypes.DATE,
    lastPurchaseAt: DataTypes.DATE,
    sourceOverlapStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'CLEAR' },
    authorityStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SHADOW_UNVERIFIED' },
    calculationVersion: { type: DataTypes.STRING(80), allowNull: false },
    calculatedAt: { type: DataTypes.DATE, allowNull: false },
    automationEligible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  }, {
    sequelize,
    modelName: 'CustomerRelationshipRollup',
    tableName: 'CustomerRelationshipRollups',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'memberId'], name: 'customer_relationship_rollups_unique_member' },
      { fields: ['wineryId', 'isCurrentClubMember', 'lastPurchaseAt'], name: 'customer_relationship_rollups_activity' },
      { fields: ['wineryId', 'sourceOverlapStatus'], name: 'customer_relationship_rollups_overlap' }
    ]
  });

  return CustomerRelationshipRollup;
};
