const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerMonetaryRollup extends Model {
    static associate(models) {
      CustomerMonetaryRollup.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerMonetaryRollup.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerMonetaryRollup.belongsTo(models.CustomerRollupRun, { foreignKey: 'lastRunId', as: 'LastRun' });
    }
  }

  CustomerMonetaryRollup.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    lastRunId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'CustomerRollupRuns', key: 'id' } },
    grossPaidMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    refundedMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    netPaidMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    contributingOrderCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sourceOverlapStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'CLEAR' },
    authorityStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SHADOW_UNVERIFIED' },
    calculationVersion: { type: DataTypes.STRING(80), allowNull: false },
    calculatedAt: { type: DataTypes.DATE, allowNull: false },
    automationEligible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  }, {
    sequelize,
    modelName: 'CustomerMonetaryRollup',
    tableName: 'CustomerMonetaryRollups',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'memberId', 'currency'], name: 'customer_monetary_rollups_unique_currency' },
      { fields: ['wineryId', 'currency', 'netPaidMinor'], name: 'customer_monetary_rollups_value' }
    ]
  });

  return CustomerMonetaryRollup;
};
