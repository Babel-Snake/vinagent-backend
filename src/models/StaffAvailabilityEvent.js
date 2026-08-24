const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StaffAvailabilityEvent extends Model {
    static associate(models) {
      StaffAvailabilityEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      StaffAvailabilityEvent.belongsTo(models.StaffIdentity, {
        foreignKey: 'staffIdentityId',
        as: 'StaffIdentity'
      });
      StaffAvailabilityEvent.belongsTo(models.ExternalResourceReference, {
        foreignKey: 'primarySourceReferenceId',
        as: 'PrimarySourceReference'
      });
      StaffAvailabilityEvent.belongsTo(models.IntegrationConnection, {
        foreignKey: 'authorityConnectionId',
        as: 'AuthorityConnection'
      });
    }
  }

  StaffAvailabilityEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    staffIdentityId: { type: DataTypes.INTEGER, allowNull: false },
    primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    eventKey: { type: DataTypes.STRING(180), allowNull: false },
    availabilityType: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    startAt: { type: DataTypes.DATE, allowNull: false },
    endAt: { type: DataTypes.DATE, allowNull: false },
    reasonCategory: DataTypes.STRING(80),
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
    modelName: 'StaffAvailabilityEvent',
    tableName: 'StaffAvailabilityEvents',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['primarySourceReferenceId'],
        name: 'staff_availability_events_unique_source'
      },
      {
        fields: ['wineryId', 'staffIdentityId', 'startAt', 'endAt'],
        name: 'staff_availability_events_staff_time'
      },
      {
        fields: ['wineryId', 'availabilityType', 'status', 'startAt'],
        name: 'staff_availability_events_coverage'
      }
    ]
  });

  return StaffAvailabilityEvent;
};
