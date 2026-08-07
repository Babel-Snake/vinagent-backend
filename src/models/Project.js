const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Project extends Model {
    static associate(models) {
      Project.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Project.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'Owner' });
      Project.belongsTo(models.User, { foreignKey: 'leadUserId', as: 'Lead' });
      Project.belongsTo(models.User, { foreignKey: 'leadGrantedByUserId', as: 'LeadGrantor' });
      Project.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      Project.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      Project.hasMany(models.ProjectArea, { foreignKey: 'projectId', as: 'AreaLinks' });
      Project.hasMany(models.ProjectParticipant, { foreignKey: 'projectId', as: 'Participants' });
      Project.hasMany(models.ProjectItem, { foreignKey: 'projectId', as: 'ItemLinks' });
      Project.hasMany(models.ProjectTaskDependency, { foreignKey: 'projectId', as: 'TaskDependencies' });
      Project.hasMany(models.ProjectAuditEvent, { foreignKey: 'projectId', as: 'AuditEvents' });
      Project.belongsToMany(models.OperationalArea, {
        through: models.ProjectArea,
        foreignKey: 'projectId',
        otherKey: 'areaId',
        as: 'OperationalAreas'
      });
      Project.belongsToMany(models.User, {
        through: models.ProjectParticipant,
        foreignKey: 'projectId',
        otherKey: 'userId',
        as: 'ParticipantUsers'
      });
    }
  }

  Project.init({
    title: { type: DataTypes.STRING, allowNull: false },
    intendedOutcome: { type: DataTypes.TEXT, allowNull: false },
    businessContext: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PLANNED'
    },
    areaScope: {
      type: DataTypes.ENUM('ORGANISATION', 'AREAS'),
      allowNull: false,
      defaultValue: 'ORGANISATION'
    },
    plannedStartAt: { type: DataTypes.DATE, allowNull: true },
    targetEndAt: { type: DataTypes.DATE, allowNull: true },
    actualCompletedAt: { type: DataTypes.DATE, allowNull: true },
    riskReason: { type: DataTypes.TEXT, allowNull: true },
    riskReviewAt: { type: DataTypes.DATE, allowNull: true },
    completionReason: { type: DataTypes.TEXT, allowNull: true },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    ownerUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    leadUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    leadGrantedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    leadGrantedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'Project',
    tableName: 'Projects',
    timestamps: true,
    indexes: [
      { fields: ['wineryId', 'status', 'targetEndAt'] },
      { fields: ['wineryId', 'ownerUserId', 'status'] },
      { fields: ['wineryId', 'leadUserId', 'status'] },
      { fields: ['wineryId', 'areaScope'] },
      { fields: ['wineryId', 'updatedAt'] }
    ]
  });

  return Project;
};
