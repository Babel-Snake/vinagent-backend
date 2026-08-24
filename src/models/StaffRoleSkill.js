const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StaffRoleSkill extends Model {
    static associate(models) {
      StaffRoleSkill.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      StaffRoleSkill.belongsTo(models.StaffIdentity, { foreignKey: 'staffIdentityId', as: 'StaffIdentity' });
      StaffRoleSkill.belongsTo(models.RoleSkillDefinition, { foreignKey: 'definitionId', as: 'Definition' });
      StaffRoleSkill.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'sourceReferenceId',
        as: 'SourceReference'
      });
      StaffRoleSkill.belongsTo(models.User, { foreignKey: 'confirmedBy', as: 'Confirmer' });
    }
  }

  StaffRoleSkill.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    staffIdentityId: { type: DataTypes.INTEGER, allowNull: false },
    definitionId: { type: DataTypes.INTEGER, allowNull: false },
    sourceReferenceId: DataTypes.INTEGER,
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
    proficiencyLevel: DataTypes.STRING(80),
    validFrom: DataTypes.DATE,
    validTo: DataTypes.DATE,
    confirmationStatus: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'MANAGER_CONFIRMED'
    },
    confirmedBy: DataTypes.INTEGER,
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'StaffRoleSkill',
    tableName: 'StaffRoleSkills',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['staffIdentityId', 'definitionId'],
        name: 'staff_role_skills_unique_assignment'
      },
      { fields: ['wineryId', 'definitionId', 'status'], name: 'staff_role_skills_definition_status' }
    ]
  });

  return StaffRoleSkill;
};
