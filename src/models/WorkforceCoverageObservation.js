const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkforceCoverageObservation extends Model {
    static associate(models) {
      WorkforceCoverageObservation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WorkforceCoverageObservation.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
      WorkforceCoverageObservation.belongsTo(models.WineryLocation, {
        foreignKey: 'locationId',
        as: 'Location'
      });
      WorkforceCoverageObservation.belongsTo(models.OperationalArea, {
        foreignKey: 'areaId',
        as: 'Area'
      });
    }
  }

  WorkforceCoverageObservation.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    locationId: DataTypes.INTEGER,
    areaId: DataTypes.INTEGER,
    coverageKey: { type: DataTypes.STRING(64), allowNull: false },
    windowStartAt: { type: DataTypes.DATE, allowNull: false },
    windowEndAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    staleAt: { type: DataTypes.DATE, allowNull: false },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    isComplete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    projectionQuality: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'SOURCE_ASSERTED'
    }
  }, {
    sequelize,
    modelName: 'WorkforceCoverageObservation',
    tableName: 'WorkforceCoverageObservations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'authorityConnectionId', 'coverageKey'],
        name: 'workforce_coverage_observations_unique_window'
      },
      {
        fields: ['wineryId', 'locationId', 'areaId', 'windowStartAt', 'windowEndAt'],
        name: 'workforce_coverage_observations_scope_window'
      },
      {
        fields: ['wineryId', 'staleAt', 'isComplete'],
        name: 'workforce_coverage_observations_freshness'
      }
    ]
  });

  return WorkforceCoverageObservation;
};
