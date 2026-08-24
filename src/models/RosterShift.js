const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RosterShift extends Model {
    static associate(models) {
      RosterShift.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      RosterShift.belongsTo(models.StaffIdentity, { foreignKey: 'staffIdentityId', as: 'StaffIdentity' });
      RosterShift.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      RosterShift.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      RosterShift.belongsTo(models.RoleSkillDefinition, { foreignKey: 'roleDefinitionId', as: 'RoleDefinition' });
      RosterShift.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      RosterShift.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
      RosterShift.hasMany(models.RosterShiftSkill, { foreignKey: 'rosterShiftId', as: 'Skills' });
    }
  }

  RosterShift.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    staffIdentityId: { type: DataTypes.INTEGER, allowNull: false },
    locationId: DataTypes.INTEGER,
    areaId: DataTypes.INTEGER,
    roleDefinitionId: DataTypes.INTEGER,
    roleResolutionStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
    externalRoleCode: DataTypes.STRING(120),
    primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: DataTypes.STRING(120),
    publishedState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    startAt: { type: DataTypes.DATE, allowNull: false },
    endAt: { type: DataTypes.DATE, allowNull: false },
    breakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sourceTimeZone: DataTypes.STRING(80),
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    observedAt: { type: DataTypes.DATE, allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    projectionQuality: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'SOURCE_ASSERTED'
    },
    deletedAtSource: DataTypes.DATE,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'RosterShift',
    tableName: 'RosterShifts',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['primarySourceReferenceId'], name: 'roster_shifts_unique_source' },
      { fields: ['wineryId', 'staffIdentityId', 'startAt'], name: 'roster_shifts_staff_time' },
      { fields: ['wineryId', 'areaId', 'startAt', 'endAt'], name: 'roster_shifts_area_time' },
      { fields: ['wineryId', 'locationId', 'startAt', 'endAt'], name: 'roster_shifts_location_time' },
      {
        fields: ['wineryId', 'canonicalStatus', 'publishedState', 'startAt'],
        name: 'roster_shifts_coverage'
      }
    ]
  });

  return RosterShift;
};
