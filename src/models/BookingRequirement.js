const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingRequirement extends Model {
    static associate(models) {
      BookingRequirement.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BookingRequirement.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'Booking' });
      BookingRequirement.belongsTo(models.OperationalArea, { foreignKey: 'responsibleAreaId', as: 'ResponsibleArea' });
      BookingRequirement.belongsTo(models.ExternalResourceReference, { foreignKey: 'sourceReferenceId', as: 'SourceReference' });
    }
  }
  BookingRequirement.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    bookingId: { type: DataTypes.INTEGER, allowNull: false },
    responsibleAreaId: DataTypes.INTEGER,
    sourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    requirementKey: { type: DataTypes.STRING(255), allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    sourceKind: { type: DataTypes.STRING(40), allowNull: false },
    code: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unit: DataTypes.STRING(40),
    importance: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NORMAL' },
    fulfilmentStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNCONFIRMED' },
    qualityState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    sensitivityClass: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'OPERATIONAL' },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    removedAt: DataTypes.DATE
  }, {
    sequelize, modelName: 'BookingRequirement', tableName: 'BookingRequirements', timestamps: true,
    indexes: [
      { unique: true, fields: ['bookingId', 'requirementKey'], name: 'booking_requirements_unique_key' },
      { fields: ['wineryId', 'kind', 'code', 'isActive'], name: 'booking_requirements_operational_lookup' },
      { fields: ['wineryId', 'sensitivityClass', 'isActive'], name: 'booking_requirements_sensitivity' }
    ]
  });
  return BookingRequirement;
};
