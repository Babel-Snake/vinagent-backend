const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectParticipant extends Model {
    static associate(models) {
      ProjectParticipant.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      ProjectParticipant.belongsTo(models.Project, { foreignKey: 'projectId' });
      ProjectParticipant.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      ProjectParticipant.belongsTo(models.User, { foreignKey: 'addedBy', as: 'AddedBy' });
    }
  }

  ProjectParticipant.init({
    participationRole: {
      type: DataTypes.ENUM('PARTICIPANT', 'STAKEHOLDER'),
      allowNull: false,
      defaultValue: 'PARTICIPANT'
    },
    notificationsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Projects', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    addedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'ProjectParticipant',
    tableName: 'ProjectParticipants',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['projectId', 'userId'] },
      { fields: ['wineryId', 'userId', 'projectId'] }
    ]
  });

  return ProjectParticipant;
};
