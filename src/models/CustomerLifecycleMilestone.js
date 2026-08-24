const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerLifecycleMilestone extends Model {
    static associate(models) {
      CustomerLifecycleMilestone.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerLifecycleMilestone.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      CustomerLifecycleMilestone.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
    }
  }

  CustomerLifecycleMilestone.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    memberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    milestoneKey: { type: DataTypes.STRING(120), allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    sourceType: { type: DataTypes.STRING(120), allowNull: false },
    sourceId: DataTypes.INTEGER,
    sourceReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' }
    },
    derivationType: { type: DataTypes.STRING(40), allowNull: false },
    derivationVersion: { type: DataTypes.STRING(40), allowNull: false },
    sourceKey: { type: DataTypes.STRING(180), allowNull: false },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'CustomerLifecycleMilestone',
    tableName: 'CustomerLifecycleMilestones',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'sourceKey'], name: 'customer_lifecycle_milestones_unique_source' },
      {
        fields: ['wineryId', 'memberId', 'milestoneKey', 'occurredAt'],
        name: 'customer_lifecycle_milestones_timeline'
      }
    ]
  });

  return CustomerLifecycleMilestone;
};
