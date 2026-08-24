const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RosterShiftSkill extends Model {
    static associate(models) {
      RosterShiftSkill.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      RosterShiftSkill.belongsTo(models.RosterShift, { foreignKey: 'rosterShiftId', as: 'RosterShift' });
      RosterShiftSkill.belongsTo(models.RoleSkillDefinition, { foreignKey: 'definitionId', as: 'Definition' });
    }
  }

  RosterShiftSkill.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    rosterShiftId: { type: DataTypes.INTEGER, allowNull: false },
    definitionId: DataTypes.INTEGER,
    skillCode: { type: DataTypes.STRING(120), allowNull: false },
    skillResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    removedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'RosterShiftSkill',
    tableName: 'RosterShiftSkills',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['rosterShiftId', 'skillCode'],
        name: 'roster_shift_skills_unique_code'
      },
      { fields: ['wineryId', 'definitionId', 'isActive'], name: 'roster_shift_skills_definition' }
    ]
  });

  return RosterShiftSkill;
};
