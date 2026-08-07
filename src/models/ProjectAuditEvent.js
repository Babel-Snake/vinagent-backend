const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectAuditEvent extends Model {
    static associate(models) {
      ProjectAuditEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectAuditEvent.belongsTo(models.Project, { foreignKey: 'projectId' });
      ProjectAuditEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'Actor' });
    }
  }

  ProjectAuditEvent.init({
    eventType: {
      type: DataTypes.ENUM(
        'CREATED', 'UPDATED', 'STATUS_CHANGED', 'OWNER_CHANGED', 'DATES_CHANGED',
        'RISK_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_UPDATED', 'PARTICIPANT_REMOVED', 'AREA_CHANGED',
        'ITEM_LINKED', 'ITEM_UPDATED', 'ITEM_UNLINKED', 'DEPENDENCY_ADDED',
        'DEPENDENCY_REMOVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED',
        'COMPLETED', 'COMPLETION_OVERRIDDEN', 'REOPENED', 'CANCELLED',
        'LEAD_ASSIGNED', 'LEAD_CHANGED', 'LEAD_REVOKED', 'TASK_DELEGATED'
      ),
      allowNull: false
    },
    beforeSnapshot: { type: DataTypes.JSON, allowNull: true },
    afterSnapshot: { type: DataTypes.JSON, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' } },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'ProjectAuditEvent',
    tableName: 'ProjectAuditEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['wineryId', 'projectId', 'createdAt'] },
      { fields: ['wineryId', 'actorUserId', 'createdAt'] }
    ]
  });

  return ProjectAuditEvent;
};
