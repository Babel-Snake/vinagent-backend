const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingAreaLink extends Model {
    static associate(models) {
      BookingAreaLink.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BookingAreaLink.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'Booking' });
      BookingAreaLink.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }
  BookingAreaLink.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    bookingId: { type: DataTypes.INTEGER, allowNull: false },
    areaId: { type: DataTypes.INTEGER, allowNull: false },
    relationshipType: { type: DataTypes.STRING(40), allowNull: false }
  }, {
    sequelize, modelName: 'BookingAreaLink', tableName: 'BookingAreaLinks', timestamps: true,
    indexes: [
      { unique: true, fields: ['bookingId', 'areaId', 'relationshipType'], name: 'booking_area_links_unique' },
      { fields: ['wineryId', 'areaId', 'relationshipType'], name: 'booking_area_links_area' }
    ]
  });
  return BookingAreaLink;
};
