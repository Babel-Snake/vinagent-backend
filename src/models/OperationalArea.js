const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalArea extends Model {
    static associate(models) {
      OperationalArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalArea.hasMany(models.UserAreaMembership, { foreignKey: 'areaId', as: 'Memberships' });
      OperationalArea.hasMany(models.TaskArea, { foreignKey: 'areaId', as: 'TaskLinks' });
      OperationalArea.hasMany(models.NoticeArea, { foreignKey: 'areaId', as: 'NoticeLinks' });
      OperationalArea.hasMany(models.OperationalRequestArea, { foreignKey: 'areaId', as: 'RequestLinks' });
      OperationalArea.hasMany(models.OperationalRecordArea, { foreignKey: 'areaId', as: 'RecordLinks' });
      OperationalArea.hasMany(models.OperationalIntelligenceSignal, { foreignKey: 'areaId', as: 'IntelligenceSignals' });
      OperationalArea.hasMany(models.IntelligenceFact, { foreignKey: 'areaId', as: 'IntelligenceFacts' });
      OperationalArea.hasMany(models.ProjectArea, { foreignKey: 'areaId', as: 'ProjectLinks' });
      OperationalArea.hasOne(models.OperationalAreaProfile, { foreignKey: 'areaId', as: 'Profile' });
      OperationalArea.hasOne(models.OperationalAreaBookingsConfig, { foreignKey: 'areaId', as: 'BookingsConfig' });
      OperationalArea.hasMany(models.WineryBookingType, { foreignKey: 'areaId', as: 'BookingTypes' });
      OperationalArea.hasMany(models.AreaProductListing, { foreignKey: 'areaId', as: 'ProductListings' });
      OperationalArea.hasOne(models.OperationalAreaIntegrationConfig, { foreignKey: 'areaId', as: 'IntegrationConfig' });
            OperationalArea.hasMany(models.LocationAreaLink, { foreignKey: 'areaId', as: 'LocationLinks' });
            OperationalArea.hasMany(models.BookingAreaLink, { foreignKey: 'areaId', as: 'BookingLinks' });
            OperationalArea.hasMany(models.BookingRequirement, { foreignKey: 'responsibleAreaId', as: 'BookingRequirements' });
      OperationalArea.hasMany(models.RosterShift, { foreignKey: 'areaId', as: 'RosterShifts' });
      OperationalArea.hasMany(models.WorkforceDemandMapping, { foreignKey: 'areaId', as: 'WorkforceDemandMappings' });
      OperationalArea.hasMany(models.WorkforceCoverageObservation, {
        foreignKey: 'areaId',
        as: 'WorkforceCoverageObservations'
      });
      OperationalArea.hasMany(models.DataAuthorityPolicySet, { foreignKey: 'areaId', as: 'AuthorityPolicySets' });
      OperationalArea.hasMany(models.WineryFAQItem, { foreignKey: 'areaId', as: 'FAQs' });
      OperationalArea.hasMany(models.WinerySop, { foreignKey: 'areaId', as: 'Sops' });
      OperationalArea.hasMany(models.WineryContactArea, { foreignKey: 'areaId', as: 'ContactLinks' });
      OperationalArea.belongsToMany(models.WineryContact, {
        through: models.WineryContactArea,
        foreignKey: 'areaId',
        otherKey: 'contactId',
        as: 'Contacts'
      });
      OperationalArea.belongsToMany(models.User, {
        through: models.UserAreaMembership,
        foreignKey: 'areaId',
        otherKey: 'userId',
        as: 'Users'
      });
      OperationalArea.belongsToMany(models.Task, {
        through: models.TaskArea,
        foreignKey: 'areaId',
        otherKey: 'taskId',
        as: 'Tasks'
      });
      OperationalArea.belongsToMany(models.Notice, {
        through: models.NoticeArea,
        foreignKey: 'areaId',
        otherKey: 'noticeId',
        as: 'Notices'
      });
      OperationalArea.belongsToMany(models.OperationalRequest, {
        through: models.OperationalRequestArea,
        foreignKey: 'areaId',
        otherKey: 'requestId',
        as: 'OperationalRequests'
      });
      OperationalArea.belongsToMany(models.OperationalRecord, {
        through: models.OperationalRecordArea,
        foreignKey: 'areaId',
        otherKey: 'recordId',
        as: 'OperationalRecords'
      });
      OperationalArea.belongsToMany(models.Project, {
        through: models.ProjectArea,
        foreignKey: 'areaId',
        otherKey: 'projectId',
        as: 'Projects'
      });
    }
  }

  OperationalArea.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'OperationalArea',
      tableName: 'OperationalAreas',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['wineryId', 'name'] },
        { fields: ['wineryId', 'isActive', 'sortOrder'] }
      ]
    }
  );

  return OperationalArea;
};
