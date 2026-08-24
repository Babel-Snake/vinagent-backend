const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingItem extends Model {
    static associate(models) {
      BookingItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      BookingItem.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'Booking' });
      BookingItem.belongsTo(models.WineryBookingType, { foreignKey: 'bookingTypeId', as: 'BookingType' });
    }
  }
  BookingItem.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    bookingId: { type: DataTypes.INTEGER, allowNull: false },
    bookingTypeId: DataTypes.INTEGER,
    itemKey: { type: DataTypes.STRING(255), allowNull: false },
    itemType: { type: DataTypes.STRING(40), allowNull: false },
    externalCode: DataTypes.STRING(120),
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unit: DataTypes.STRING(40),
    unitPriceCents: DataTypes.INTEGER,
    currency: DataTypes.STRING(3),
    fulfilmentStatus: DataTypes.STRING(40),
    sourceRevision: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    removedAt: DataTypes.DATE
  }, {
    sequelize, modelName: 'BookingItem', tableName: 'BookingItems', timestamps: true,
    indexes: [
      { unique: true, fields: ['bookingId', 'itemKey'], name: 'booking_items_unique_key' },
      { fields: ['wineryId', 'itemType', 'externalCode', 'isActive'], name: 'booking_items_operational_lookup' }
    ]
  });
  return BookingItem;
};
