const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingStatusEvent extends Model {
    static associate(models) {
      BookingStatusEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BookingStatusEvent.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'Booking' });
      BookingStatusEvent.belongsTo(models.IntegrationEvent, { foreignKey: 'sourceEventId', as: 'SourceEvent' });
    }
  }
  BookingStatusEvent.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    bookingId: { type: DataTypes.INTEGER, allowNull: false },
    sourceEventId: { type: DataTypes.INTEGER, allowNull: false },
    eventKey: { type: DataTypes.STRING(120), allowNull: false },
    fromStatus: DataTypes.STRING(40),
    toStatus: { type: DataTypes.STRING(40), allowNull: false },
    providerStatus: { type: DataTypes.STRING(80), allowNull: false },
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    reason: DataTypes.STRING(255)
  }, {
    sequelize, modelName: 'BookingStatusEvent', tableName: 'BookingStatusEvents', timestamps: true,
    indexes: [
      { unique: true, fields: ['bookingId', 'eventKey'], name: 'booking_status_events_unique_event' },
      { fields: ['wineryId', 'effectiveAt'], name: 'booking_status_events_winery_date' }
    ]
  });
  return BookingStatusEvent;
};
