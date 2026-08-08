const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UsageExportDelivery extends Model {
    static associate(models) {
      UsageExportDelivery.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      UsageExportDelivery.belongsTo(models.UsageEvent, { foreignKey: 'usageEventId' });
    }
  }

  UsageExportDelivery.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    usageEventId: { type: DataTypes.STRING(36), allowNull: false },
    destination: { type: DataTypes.STRING(32), allowNull: false },
    externalIdentifier: { type: DataTypes.STRING(191), allowNull: true },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDING' },
    attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastAttemptAt: { type: DataTypes.DATE, allowNull: true },
    lastErrorCode: { type: DataTypes.STRING(80), allowNull: true }
  }, {
    sequelize,
    modelName: 'UsageExportDelivery',
    tableName: 'UsageExportDeliveries',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['usageEventId', 'destination'] },
      { fields: ['wineryId', 'status', 'createdAt'] }
    ]
  });

  return UsageExportDelivery;
};
