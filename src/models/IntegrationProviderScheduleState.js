const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationProviderScheduleState extends Model {
    static associate(models) {
      IntegrationProviderScheduleState.belongsTo(models.IntegrationConnection, {
        foreignKey: 'lastConnectionId',
        as: 'LastConnection'
      });
    }
  }

  IntegrationProviderScheduleState.init({
    domain: { type: DataTypes.STRING(80), allowNull: false },
    providerKey: { type: DataTypes.STRING(120), allowNull: false },
    nextPermitAt: DataTypes.DATE,
    rateWindowStartedAt: DataTypes.DATE,
    rateWindowScheduledCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastScheduledAt: DataTypes.DATE,
    lastConnectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationConnections', key: 'id' }
    },
    lastJobKind: DataTypes.STRING(120),
    scheduledCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'IntegrationProviderScheduleState',
    tableName: 'IntegrationProviderScheduleStates',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['domain', 'providerKey'],
        name: 'integration_provider_schedule_states_unique'
      },
      { fields: ['nextPermitAt'], name: 'integration_provider_schedule_states_due' }
    ]
  });

  return IntegrationProviderScheduleState;
};
