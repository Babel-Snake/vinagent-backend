const crypto = require('crypto');
const Joi = require('joi');
const { stableSerialize } = require('../../integrationDataFoundation.service');

const BOOKING_FEED_SCHEMA_VERSION = 'vinagent.booking-feed.v1';
const BOOKING_STATUSES = Object.freeze([
  'ENQUIRY',
  'PENDING',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
]);
const REQUIREMENT_KINDS = Object.freeze([
  'EXPERIENCE',
  'ADD_ON',
  'DIETARY',
  'ACCESSIBILITY',
  'SEATING',
  'OTHER'
]);
const GUEST_DATA_MODES = Object.freeze(['NONE', 'EXTERNAL_ID', 'IDENTITY_MINIMUM']);

const boundedText = max => Joi.string().trim().min(1).max(max);
const nullableText = max => Joi.string().trim().max(max).allow('', null);

const bookingSchema = Joi.object({
  id: boundedText(255).required(),
  revision: boundedText(120).required(),
  status: Joi.string().trim().uppercase().valid(...BOOKING_STATUSES).required(),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().allow(null),
  partySize: Joi.number().integer().min(1).max(10000).required(),
  locationId: boundedText(255).required(),
  experience: Joi.object({
    code: boundedText(120).required(),
    name: boundedText(200).required()
  }).unknown(false).allow(null),
  requirements: Joi.array().items(Joi.object({
    kind: Joi.string().trim().uppercase().valid(...REQUIREMENT_KINDS).required(),
    code: boundedText(120).required(),
    label: boundedText(255).required(),
    quantity: Joi.number().integer().min(1).max(10000).default(1)
  }).unknown(false)).max(50).default([]),
  guest: Joi.object({
    externalId: nullableText(255),
    firstName: nullableText(160),
    lastName: nullableText(160),
    email: Joi.string().trim().email({ tlds: { allow: false } }).max(320).allow('', null),
    phone: nullableText(40)
  }).unknown(false).allow(null),
  createdAt: Joi.date().iso().allow(null),
  updatedAt: Joi.date().iso().required(),
  deletedAt: Joi.date().iso().allow(null)
}).custom((value, helpers) => {
  if (value.endAt && value.endAt.getTime() < value.startAt.getTime()) {
    return helpers.message('booking endAt must not precede startAt');
  }
  if (value.deletedAt && value.status !== 'CANCELLED') {
    return helpers.message('deleted bookings must use CANCELLED status');
  }
  const requirementKeys = value.requirements.map(requirement => `${requirement.kind}:${requirement.code}`);
  if (new Set(requirementKeys).size !== requirementKeys.length) {
    return helpers.message('booking requirements must have unique kind/code identities');
  }
  return value;
}, 'booking timeline validation').unknown(false);

const bookingPageSchema = Joi.object({
  schemaVersion: Joi.string().valid(BOOKING_FEED_SCHEMA_VERSION).required(),
  bookings: Joi.array().items(bookingSchema).max(100).required(),
  nextCursor: nullableText(2000),
  hasMore: Joi.boolean().required(),
  watermarkAt: Joi.date().iso().allow(null),
  snapshotComplete: Joi.boolean().default(false)
}).custom((value, helpers) => {
  if (value.hasMore && !value.nextCursor) return helpers.message('nextCursor is required when hasMore is true');
  if (!value.hasMore && value.nextCursor) return helpers.message('nextCursor must be empty when hasMore is false');
  return value;
}, 'booking page cursor validation').unknown(false);

const healthSchema = Joi.object({
  schemaVersion: Joi.string().valid(BOOKING_FEED_SCHEMA_VERSION).required(),
  status: Joi.string().valid('ok').required(),
  accountId: nullableText(255),
  locations: Joi.array().items(Joi.object({
    id: boundedText(255).required(),
    name: nullableText(200)
  }).unknown(false)).min(1).max(500).required()
}).unknown(false);

function validateSchema(schema, payload, contractName) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error) {
    const contractError = new Error(`${contractName} response does not satisfy ${BOOKING_FEED_SCHEMA_VERSION}`);
    contractError.code = 'BOOKING_FEED_SCHEMA_INVALID';
    contractError.permanent = true;
    throw contractError;
  }
  return value;
}

const isoOrNull = value => value ? new Date(value).toISOString() : null;

function normalizeGuest(guest, guestDataMode) {
  if (!guest || guestDataMode === 'NONE') return null;
  if (guestDataMode === 'EXTERNAL_ID') return guest.externalId ? { externalId: guest.externalId } : null;
  return {
    externalId: guest.externalId || null,
    firstName: guest.firstName || null,
    lastName: guest.lastName || null,
    email: guest.email ? guest.email.toLowerCase() : null,
    phone: guest.phone || null
  };
}

function bookingSourceHash(normalizedBooking) {
  const sourceContent = { ...normalizedBooking };
  delete sourceContent.sourceHash;
  return crypto.createHash('sha256').update(stableSerialize(sourceContent)).digest('hex');
}

function normalizeBooking(booking, { guestDataMode = 'NONE' } = {}) {
  const normalized = {
    externalId: booking.id,
    revision: booking.revision,
    status: booking.status,
    startAt: isoOrNull(booking.startAt),
    endAt: isoOrNull(booking.endAt),
    partySize: booking.partySize,
    externalLocationId: booking.locationId,
    experience: booking.experience ? { code: booking.experience.code, name: booking.experience.name } : null,
    requirements: booking.requirements.map(requirement => ({
      kind: requirement.kind,
      code: requirement.code,
      label: requirement.label,
      quantity: requirement.quantity
    })),
    guest: normalizeGuest(booking.guest, guestDataMode),
    providerCreatedAt: isoOrNull(booking.createdAt),
    providerUpdatedAt: isoOrNull(booking.updatedAt),
    deletedAt: isoOrNull(booking.deletedAt)
  };
  return {
    ...normalized,
    sourceHash: bookingSourceHash(normalized)
  };
}

function validateAndNormalizeBookingPage(payload, { guestDataMode = 'NONE' } = {}) {
  const page = validateSchema(bookingPageSchema, payload, 'Booking page');
  return {
    schemaVersion: page.schemaVersion,
    bookings: page.bookings.map(booking => normalizeBooking(booking, { guestDataMode })),
    nextCursor: page.nextCursor || null,
    hasMore: page.hasMore,
    watermarkAt: isoOrNull(page.watermarkAt),
    snapshotComplete: page.snapshotComplete
  };
}

function validateBookingFeedHealth(payload) {
  return validateSchema(healthSchema, payload, 'Health');
}

module.exports = {
  BOOKING_FEED_SCHEMA_VERSION,
  BOOKING_STATUSES,
  REQUIREMENT_KINDS,
  GUEST_DATA_MODES,
  validateAndNormalizeBookingPage,
  validateBookingFeedHealth,
  bookingSourceHash,
  normalizeBooking
};
