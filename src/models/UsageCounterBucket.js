const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UsageCounterBucket extends Model {
    static associate(models) {
      UsageCounterBucket.belongsTo(models.Winery, { foreignKey: 'wineryId' });
    }
  }

  UsageCounterBucket.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    metricKey: { type: DataTypes.STRING(80), allowNull: false },
    bucketStart: { type: DataTypes.DATE, allowNull: false },
    bucketSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3600 },
    dimensionsKey: { type: DataTypes.STRING(64), allowNull: false },
    dimensions: { type: DataTypes.JSON, allowNull: true },
    eventCount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    quantity: { type: DataTypes.DECIMAL(20, 6), allowNull: false, defaultValue: 0 },
    durationMs: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    responseBytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'UsageCounterBucket',
    tableName: 'UsageCounterBuckets',
    timestamps: true,
    indexes: [{ unique: true, fields: ['wineryId', 'metricKey', 'bucketStart', 'dimensionsKey'] }]
  });

  return UsageCounterBucket;
};
