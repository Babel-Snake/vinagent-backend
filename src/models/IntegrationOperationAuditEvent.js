const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationOperationAuditEvent extends Model {
    static associate(models) {
      IntegrationOperationAuditEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationOperationAuditEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'Actor' });
      IntegrationOperationAuditEvent.belongsTo(models.IntegrationConnection, {
        foreignKey: 'connectionId',
        as: 'Connection'
      });
    }
  }

  IntegrationOperationAuditEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    actorUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    action: { type: DataTypes.STRING(80), allowNull: false },
    targetType: { type: DataTypes.STRING(80), allowNull: false },
    targetId: { type: DataTypes.STRING(120), allowNull: false },
    connectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    resourceType: DataTypes.STRING,
    streamKey: DataTypes.STRING,
    requestId: { type: DataTypes.STRING(36), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    beforeSnapshot: DataTypes.JSON,
    afterSnapshot: DataTypes.JSON,
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'IntegrationOperationAuditEvent',
    tableName: 'IntegrationOperationAuditEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'action', 'requestId'],
        name: 'integration_operation_audit_unique_request'
      },
      { fields: ['wineryId', 'createdAt'], name: 'integration_operation_audit_winery_date' },
      { fields: ['wineryId', 'targetType', 'targetId'], name: 'integration_operation_audit_target' },
      { fields: ['connectionId', 'resourceType', 'streamKey'], name: 'integration_operation_audit_stream' }
    ]
  });

  return IntegrationOperationAuditEvent;
};
