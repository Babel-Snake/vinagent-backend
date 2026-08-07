const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalIntelligenceConfigAuditEvent extends Model {
    static associate(models) {
      OperationalIntelligenceConfigAuditEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalIntelligenceConfigAuditEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'Actor' });
    }
  }

  OperationalIntelligenceConfigAuditEvent.init({
    eventType: {
      type: DataTypes.ENUM('CONFIG_UPDATED'),
      allowNull: false,
      defaultValue: 'CONFIG_UPDATED'
    },
    preset: { type: DataTypes.STRING, allowNull: true },
    beforeSnapshot: { type: DataTypes.JSON, allowNull: true },
    afterSnapshot: { type: DataTypes.JSON, allowNull: true },
    changedKeys: { type: DataTypes.JSON, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    actorUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalIntelligenceConfigAuditEvent',
    tableName: 'OperationalIntelligenceConfigAuditEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['wineryId', 'createdAt'] },
      { fields: ['wineryId', 'actorUserId', 'createdAt'] }
    ]
  });

  return OperationalIntelligenceConfigAuditEvent;
};
