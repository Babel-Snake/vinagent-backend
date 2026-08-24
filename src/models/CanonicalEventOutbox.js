const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CanonicalEventOutbox extends Model {
    static associate(models) {
      CanonicalEventOutbox.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CanonicalEventOutbox.belongsTo(models.IntegrationEvent, { foreignKey: 'eventId', as: 'Event' });
    }
  }

  CanonicalEventOutbox.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    eventId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'IntegrationEvents', key: 'id' } },
    outboxKey: { type: DataTypes.STRING, allowNull: false },
    aggregateType: { type: DataTypes.STRING(120), allowNull: false },
    aggregateId: { type: DataTypes.STRING(120), allowNull: false },
    aggregateRevision: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PENDING' },
    availableAt: { type: DataTypes.DATE, allowNull: false },
    attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    leaseOwner: DataTypes.STRING,
    leaseExpiresAt: DataTypes.DATE,
    deliveredAt: DataTypes.DATE,
    lastErrorCode: DataTypes.STRING,
    lastErrorSummary: DataTypes.TEXT,
    deadLetteredAt: DataTypes.DATE,
    replayCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastReplayedAt: DataTypes.DATE,
    correlationId: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'CanonicalEventOutbox',
    tableName: 'CanonicalEventOutbox',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['eventId'], name: 'canonical_event_outbox_unique_event' },
      { unique: true, fields: ['wineryId', 'outboxKey'], name: 'canonical_event_outbox_unique_key' },
      { fields: ['status', 'availableAt', 'leaseExpiresAt'], name: 'canonical_event_outbox_due_queue' },
      { fields: ['wineryId', 'status', 'deadLetteredAt'], name: 'canonical_event_outbox_dead_letter' }
    ]
  });

  return CanonicalEventOutbox;
};
