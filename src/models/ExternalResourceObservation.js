const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ExternalResourceObservation extends Model {
    static associate(models) {
      ExternalResourceObservation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ExternalResourceObservation.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'externalResourceReferenceId',
        as: 'ExternalResource'
      });
      ExternalResourceObservation.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }

  ExternalResourceObservation.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    externalResourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    sourceEventId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'IntegrationEvents', key: 'id' }
    },
    schemaVersion: { type: DataTypes.STRING(40), allowNull: false },
    observationKey: { type: DataTypes.STRING, allowNull: false },
    sourceRevision: DataTypes.STRING,
    sourceHash: DataTypes.STRING(64),
    normalizedState: { type: DataTypes.JSON, allowNull: false },
    providerEffectiveAt: DataTypes.DATE,
    providerUpdatedAt: DataTypes.DATE,
    observedAt: { type: DataTypes.DATE, allowNull: false },
    validFrom: { type: DataTypes.DATE, allowNull: false },
    supersededAt: DataTypes.DATE,
    sensitivityClass: DataTypes.STRING,
    redactionProfile: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ExternalResourceObservation',
    tableName: 'ExternalResourceObservations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['externalResourceReferenceId', 'schemaVersion', 'observationKey'],
        name: 'external_resource_observations_unique'
      },
      { fields: ['wineryId', 'observedAt'], name: 'external_resource_observations_winery_date' }
    ]
  });

  return ExternalResourceObservation;
};
