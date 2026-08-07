const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalItemRelation extends Model {
    static associate(models) {
      OperationalItemRelation.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalItemRelation.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  OperationalItemRelation.init({
    sourceType: { type: DataTypes.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false },
    sourceId: { type: DataTypes.INTEGER, allowNull: false },
    targetType: { type: DataTypes.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false },
    targetId: { type: DataTypes.INTEGER, allowNull: false },
    relationType: {
      type: DataTypes.ENUM('CREATED_FROM', 'RELATES_TO', 'BLOCKS', 'DUPLICATES', 'GENERATED_TASK', 'FOLLOW_UP_FOR', 'COMPLETION_RECORD'),
      allowNull: false,
      defaultValue: 'RELATES_TO'
    },
    metadata: { type: DataTypes.JSON, allowNull: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    createdBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalItemRelation',
    tableName: 'OperationalItemRelations',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['wineryId', 'sourceType', 'sourceId', 'targetType', 'targetId', 'relationType'] },
      { fields: ['wineryId', 'targetType', 'targetId'] }
    ]
  });

  return OperationalItemRelation;
};
