const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RoleSkillDefinition extends Model {
    static associate(models) {
      RoleSkillDefinition.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      RoleSkillDefinition.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      RoleSkillDefinition.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      RoleSkillDefinition.hasMany(models.StaffRoleSkill, { foreignKey: 'definitionId', as: 'StaffAssignments' });
      RoleSkillDefinition.hasMany(models.RosterShift, { foreignKey: 'roleDefinitionId', as: 'RoleShifts' });
      RoleSkillDefinition.hasMany(models.RosterShiftSkill, { foreignKey: 'definitionId', as: 'ShiftSkills' });
      RoleSkillDefinition.hasMany(models.WorkforceDemandMapping, {
        foreignKey: 'definitionId',
        as: 'DemandMappings'
      });
    }
  }

  RoleSkillDefinition.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    definitionKind: { type: DataTypes.STRING(20), allowNull: false },
    code: { type: DataTypes.STRING(120), allowNull: false },
    normalizedCode: { type: DataTypes.STRING(120), allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'RoleSkillDefinition',
    tableName: 'RoleSkillDefinitions',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['wineryId', 'definitionKind', 'normalizedCode'],
        name: 'role_skill_definitions_unique_code'
      },
      { fields: ['wineryId', 'definitionKind', 'isActive'], name: 'role_skill_definitions_winery_kind' }
    ]
  });

  return RoleSkillDefinition;
};
