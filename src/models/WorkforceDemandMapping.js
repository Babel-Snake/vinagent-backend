const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkforceDemandMapping extends Model {
    static associate(models) {
      WorkforceDemandMapping.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WorkforceDemandMapping.belongsTo(models.IntegrationConnection, {
        foreignKey: 'sourceConnectionId',
        as: 'SourceConnection'
      });
      WorkforceDemandMapping.belongsTo(models.RoleSkillDefinition, {
        foreignKey: 'definitionId',
        as: 'Definition'
      });
      WorkforceDemandMapping.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      WorkforceDemandMapping.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      WorkforceDemandMapping.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      WorkforceDemandMapping.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
    }
  }

  WorkforceDemandMapping.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    sourceRecordType: { type: DataTypes.STRING(40), allowNull: false },
    sourceConnectionId: DataTypes.INTEGER,
    sourceCode: { type: DataTypes.STRING(160), allowNull: false },
    sourceCodeNormalized: { type: DataTypes.STRING(160), allowNull: false },
    mappingKey: { type: DataTypes.STRING(64), allowNull: false },
    definitionId: { type: DataTypes.INTEGER, allowNull: false },
    areaId: DataTypes.INTEGER,
    locationId: DataTypes.INTEGER,
    headcountMultiplier: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
    bufferBeforeMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bufferAfterMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    confirmationStatus: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'MANAGER_CONFIRMED'
    },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'WorkforceDemandMapping',
    tableName: 'WorkforceDemandMappings',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'mappingKey'],
        name: 'workforce_demand_mappings_unique_key'
      },
      {
        fields: ['wineryId', 'sourceRecordType', 'sourceCodeNormalized', 'status'],
        name: 'workforce_demand_mappings_lookup'
      },
      {
        fields: ['wineryId', 'definitionId', 'status'],
        name: 'workforce_demand_mappings_definition'
      }
    ]
  });

  return WorkforceDemandMapping;
};
