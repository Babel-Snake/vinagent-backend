const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UsageEvent extends Model {
    static associate(models) {
      UsageEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      UsageEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'Actor' });
      UsageEvent.hasMany(models.UsageExportDelivery, { foreignKey: 'usageEventId', as: 'ExportDeliveries' });
    }
  }

  UsageEvent.init({
    id: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true },
    metricKey: { type: DataTypes.STRING(80), allowNull: false },
    schemaVersion: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    quantity: { type: DataTypes.DECIMAL(20, 6), allowNull: false },
    unit: { type: DataTypes.STRING(32), allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    sourceType: { type: DataTypes.STRING(48), allowNull: false },
    sourceId: { type: DataTypes.STRING(191), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(191), allowNull: false },
    dimensions: { type: DataTypes.JSON, allowNull: true }
  }, {
    sequelize,
    modelName: 'UsageEvent',
    tableName: 'UsageEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['wineryId', 'idempotencyKey'] },
      { fields: ['wineryId', 'metricKey', 'occurredAt'] },
      { fields: ['wineryId', 'actorUserId', 'occurredAt'] }
    ]
  });

  return UsageEvent;
};
