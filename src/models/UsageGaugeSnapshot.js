const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UsageGaugeSnapshot extends Model {
    static associate(models) {
      UsageGaugeSnapshot.belongsTo(models.Winery, { foreignKey: 'wineryId' });
    }
  }

  UsageGaugeSnapshot.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    metricKey: { type: DataTypes.STRING(80), allowNull: false },
    snapshotDate: { type: DataTypes.DATEONLY, allowNull: false },
    value: { type: DataTypes.DECIMAL(20, 6), allowNull: false },
    unit: { type: DataTypes.STRING(32), allowNull: false },
    dimensionsKey: { type: DataTypes.STRING(64), allowNull: false },
    dimensions: { type: DataTypes.JSON, allowNull: true },
    capturedAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'UsageGaugeSnapshot',
    tableName: 'UsageGaugeSnapshots',
    timestamps: true,
    indexes: [{ unique: true, fields: ['wineryId', 'metricKey', 'snapshotDate', 'dimensionsKey'] }]
  });

  return UsageGaugeSnapshot;
};
