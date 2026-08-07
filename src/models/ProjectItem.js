const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectItem extends Model {
    static associate(models) {
      ProjectItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectItem.belongsTo(models.Project, { foreignKey: 'projectId' });
      ProjectItem.belongsTo(models.User, { foreignKey: 'addedBy', as: 'AddedBy' });
    }
  }

  ProjectItem.init({
    itemType: {
      type: DataTypes.ENUM('TASK', 'REQUEST', 'NOTICE', 'NOTE', 'CALENDAR_EVENT'),
      allowNull: false
    },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    linkType: {
      type: DataTypes.ENUM('REFERENCE', 'DELEGATED_WORK'),
      allowNull: false,
      defaultValue: 'REFERENCE'
    },
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isMilestone: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' } },
    addedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'ProjectItem',
    tableName: 'ProjectItems',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['projectId', 'itemType', 'itemId'] },
      { fields: ['wineryId', 'itemType', 'itemId'] },
      { fields: ['wineryId', 'linkType', 'itemType', 'itemId'] },
      { fields: ['projectId', 'sortOrder', 'id'] }
    ]
  });

  return ProjectItem;
};
