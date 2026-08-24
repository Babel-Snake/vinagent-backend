const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationConfigurationAuthority extends Model {
    static associate(models) {
      IntegrationConfigurationAuthority.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationConfigurationAuthority.belongsTo(models.User, { foreignKey: 'preparedBy', as: 'Preparer' });
      IntegrationConfigurationAuthority.belongsTo(models.User, { foreignKey: 'activatedBy', as: 'Activator' });
      IntegrationConfigurationAuthority.belongsTo(models.User, { foreignKey: 'rolledBackBy', as: 'RollbackActor' });
    }
  }

  IntegrationConfigurationAuthority.init({
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    domain: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'LEGACY_PRIMARY' },
    preparedAt: DataTypes.DATE,
    preparedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    activatedAt: DataTypes.DATE,
    activatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    rolledBackAt: DataTypes.DATE,
    rolledBackBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    lastTransitionReason: DataTypes.TEXT,
    previewHash: DataTypes.STRING(64),
    readinessSnapshot: DataTypes.JSON,
    legacySnapshot: DataTypes.JSON,
    canonicalSnapshot: DataTypes.JSON,
    lastProjectedAt: DataTypes.DATE,
    lockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'IntegrationConfigurationAuthority',
    tableName: 'IntegrationConfigurationAuthorities',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'domain'],
        name: 'integration_configuration_authorities_unique'
      },
      {
        fields: ['wineryId', 'status'],
        name: 'integration_configuration_authorities_status'
      }
    ]
  });

  return IntegrationConfigurationAuthority;
};
