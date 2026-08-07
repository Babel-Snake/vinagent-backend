const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectArea extends Model {
    static associate(models) {
      ProjectArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectArea.belongsTo(models.Project, { foreignKey: 'projectId' });
      ProjectArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  ProjectArea.init({
    relationshipType: {
      type: DataTypes.ENUM('PRIMARY', 'LINKED'),
      allowNull: false,
      defaultValue: 'LINKED'
    },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' } },
    areaId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' } }
  }, {
    sequelize,
    modelName: 'ProjectArea',
    tableName: 'ProjectAreas',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['projectId', 'areaId'] },
      { fields: ['wineryId', 'areaId', 'projectId'] },
      { fields: ['projectId', 'relationshipType'] }
    ]
  });

  return ProjectArea;
};
