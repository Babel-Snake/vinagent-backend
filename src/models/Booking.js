const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    static associate(models) {
      Booking.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Booking.belongsTo(models.WineryLocation, { foreignKey: 'locationId', as: 'Location' });
      Booking.belongsTo(models.Member, { foreignKey: 'memberId', as: 'Member' });
      Booking.belongsTo(models.WineryBookingType, { foreignKey: 'primaryBookingTypeId', as: 'PrimaryBookingType' });
      Booking.belongsTo(models.ExternalResourceReference, { foreignKey: 'primarySourceReferenceId', as: 'PrimarySourceReference' });
      Booking.belongsTo(models.DataAuthorityPolicy, { foreignKey: 'authorityPolicyId', as: 'AuthorityPolicy' });
      Booking.belongsTo(models.IntegrationConnection, { foreignKey: 'authorityConnectionId', as: 'AuthorityConnection' });
      Booking.belongsTo(models.IntegrationEvent, { foreignKey: 'lastCanonicalEventId', as: 'LastCanonicalEvent' });
      Booking.hasMany(models.BookingAreaLink, { foreignKey: 'bookingId', as: 'AreaLinks' });
      Booking.hasMany(models.BookingItem, { foreignKey: 'bookingId', as: 'Items' });
      Booking.hasMany(models.BookingRequirement, { foreignKey: 'bookingId', as: 'Requirements' });
      Booking.hasMany(models.BookingStatusEvent, { foreignKey: 'bookingId', as: 'StatusEvents' });
    }
  }

  Booking.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    locationId: DataTypes.INTEGER,
    memberId: DataTypes.INTEGER,
    primaryBookingTypeId: DataTypes.INTEGER,
    primarySourceReferenceId: { type: DataTypes.INTEGER, allowNull: false },
    authorityPolicyId: DataTypes.INTEGER,
    authorityConnectionId: { type: DataTypes.INTEGER, allowNull: false },
    lastCanonicalEventId: DataTypes.INTEGER,
    canonicalStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
    providerStatus: { type: DataTypes.STRING(80), allowNull: false },
    referenceCode: { type: DataTypes.STRING(255), allowNull: false },
    sourceChannel: { type: DataTypes.STRING(120), allowNull: false },
    startAt: { type: DataTypes.DATE, allowNull: false },
    endAt: DataTypes.DATE,
    sourceTimeZone: DataTypes.STRING(80),
    partySize: { type: DataTypes.INTEGER, allowNull: false },
    bookedAt: DataTypes.DATE,
    confirmedAt: DataTypes.DATE,
    cancelledAt: DataTypes.DATE,
    checkedInAt: DataTypes.DATE,
    completedAt: DataTypes.DATE,
    totalAmountCents: DataTypes.INTEGER,
    depositAmountCents: DataTypes.INTEGER,
    paymentStatus: DataTypes.STRING(40),
    currency: DataTypes.STRING(3),
    qualityState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
    authorityState: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'IMPLICIT_SINGLE_SOURCE' },
    authoritySourceOrder: DataTypes.INTEGER,
    projectionRevision: { type: DataTypes.STRING(120), allowNull: false },
    sourceUpdatedAt: { type: DataTypes.DATE, allowNull: false },
    sourceHash: { type: DataTypes.STRING(64), allowNull: false },
    resolvedAt: { type: DataTypes.DATE, allowNull: false },
    isSourceDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    providerExtensions: DataTypes.JSON,
    lockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    modelName: 'Booking',
    tableName: 'Bookings',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['primarySourceReferenceId'], name: 'bookings_primary_source_unique' },
      { fields: ['wineryId', 'canonicalStatus', 'startAt'], name: 'bookings_winery_status_start' },
      { fields: ['wineryId', 'locationId', 'startAt'], name: 'bookings_location_start' },
      { fields: ['wineryId', 'memberId', 'startAt'], name: 'bookings_member_start' },
      { fields: ['authorityConnectionId', 'sourceUpdatedAt'], name: 'bookings_authority_source_date' }
    ]
  });

  return Booking;
};
