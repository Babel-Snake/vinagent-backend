const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineryBillingProfile extends Model {
    static associate(models) {
      WineryBillingProfile.belongsTo(models.Winery, { foreignKey: 'wineryId' });
    }
  }

  WineryBillingProfile.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    lifecycleStatus: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'PILOT' },
    planCode: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'pilot' },
    billingProvider: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'none' },
    providerCustomerId: { type: DataTypes.STRING(191), allowNull: true },
    providerSubscriptionId: { type: DataTypes.STRING(191), allowNull: true },
    trialStartedAt: { type: DataTypes.DATE, allowNull: true },
    trialEndsAt: { type: DataTypes.DATE, allowNull: true },
    currentPeriodStart: { type: DataTypes.DATE, allowNull: true },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
    meteringStartedAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'WineryBillingProfile',
    tableName: 'WineryBillingProfiles',
    timestamps: true
  });

  return WineryBillingProfile;
};
