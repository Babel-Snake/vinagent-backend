const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StaffIdentity extends Model {
    static associate(models) {
      StaffIdentity.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      StaffIdentity.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      StaffIdentity.belongsTo(models.WineryContact, { foreignKey: 'wineryContactId', as: 'WineryContact' });
      StaffIdentity.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      StaffIdentity.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      StaffIdentity.hasMany(models.StaffRoleSkill, { foreignKey: 'staffIdentityId', as: 'RoleSkills' });
      StaffIdentity.hasMany(models.RosterShift, { foreignKey: 'staffIdentityId', as: 'RosterShifts' });
      StaffIdentity.hasMany(models.StaffAvailabilityEvent, {
        foreignKey: 'staffIdentityId',
        as: 'AvailabilityEvents'
      });
    }
  }

  StaffIdentity.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    userId: DataTypes.INTEGER,
    wineryContactId: DataTypes.INTEGER,
    displayName: { type: DataTypes.STRING(160), allowNull: false },
    employmentStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    resolutionQuality: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'MANAGER_CONFIRMED'
    },
    createdBy: DataTypes.INTEGER,
    updatedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'StaffIdentity',
    tableName: 'StaffIdentities',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['userId'], name: 'staff_identities_unique_user' },
      { unique: true, fields: ['wineryContactId'], name: 'staff_identities_unique_contact' },
      { fields: ['wineryId', 'employmentStatus', 'isActive'], name: 'staff_identities_winery_status' }
    ]
  });

  return StaffIdentity;
};
