const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalItemAuditEvent extends Model {
    static associate(models) {
      OperationalItemAuditEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalItemAuditEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'Actor' });
    }
  }

  OperationalItemAuditEvent.init({
    itemType: { type: DataTypes.ENUM('REQUEST', 'NOTE'), allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    eventType: {
      type: DataTypes.ENUM(
        'CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'CANCELLED',
        'COMMENT_ADDED', 'COMMENT_DELETED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED',
        'RELATION_ADDED', 'RELATION_DELETED', 'CONVERTED_TO_TASK'
      ),
      allowNull: false
    },
    beforeSnapshot: { type: DataTypes.JSON, allowNull: true },
    afterSnapshot: { type: DataTypes.JSON, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    actorUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalItemAuditEvent',
    tableName: 'OperationalItemAuditEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['wineryId', 'itemType', 'itemId', 'createdAt'] },
      { fields: ['wineryId', 'actorUserId', 'createdAt'] }
    ]
  });

  return OperationalItemAuditEvent;
};
