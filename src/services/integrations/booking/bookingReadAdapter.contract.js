const Joi = require('joi');
const {
  BOOKING_FEED_SCHEMA_VERSION,
  BOOKING_STATUSES,
  REQUIREMENT_KINDS,
  GUEST_DATA_MODES,
  bookingSourceHash
} = require('./bookingFeed.contract');

const BOOKING_READ_ADAPTER_CONTRACT_VERSION = 'vinagent.booking-read-adapter.v1';
const BOOKING_READ_SYNC_MODES = Object.freeze(['hydration', 'incremental', 'reconciliation']);

class BookingReadAdapterContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookingReadAdapterContractError';
    this.code = code;
    this.permanent = true;
  }
}

const boundedText = max => Joi.string().trim().min(1).max(max);
const nullableText = max => Joi.string().trim().max(max).allow('', null);
const isoText = Joi.string().isoDate();

const normalizedBookingSchema = Joi.object({
  externalId: boundedText(255).required(),
  revision: boundedText(120).required(),
  status: Joi.string().trim().uppercase().valid(...BOOKING_STATUSES).required(),
  startAt: isoText.required(),
  endAt: isoText.allow(null).required(),
  partySize: Joi.number().integer().min(1).max(10000).required(),
  externalLocationId: boundedText(255).required(),
  experience: Joi.object({
    code: boundedText(120).required(),
    name: boundedText(200).required()
  }).unknown(false).allow(null).required(),
  requirements: Joi.array().items(Joi.object({
    kind: Joi.string().trim().uppercase().valid(...REQUIREMENT_KINDS).required(),
    code: boundedText(120).required(),
    label: boundedText(255).required(),
    quantity: Joi.number().integer().min(1).max(10000).required()
  }).unknown(false)).max(50).required(),
  guest: Joi.object({
    externalId: nullableText(255),
    firstName: nullableText(160),
    lastName: nullableText(160),
    email: Joi.string().trim().email({ tlds: { allow: false } }).max(320).allow('', null),
    phone: nullableText(40)
  }).unknown(false).allow(null).required(),
  providerCreatedAt: isoText.allow(null).required(),
  providerUpdatedAt: isoText.required(),
  deletedAt: isoText.allow(null).required(),
  sourceHash: Joi.string().pattern(/^[a-f0-9]{64}$/).required()
}).custom((value, helpers) => {
  if (value.endAt && new Date(value.endAt) < new Date(value.startAt)) {
    return helpers.message('normalized booking endAt must not precede startAt');
  }
  if (value.deletedAt && value.status !== 'CANCELLED') {
    return helpers.message('normalized deleted bookings must use CANCELLED status');
  }
  const requirementKeys = value.requirements.map(requirement => `${requirement.kind}:${requirement.code}`);
  if (new Set(requirementKeys).size !== requirementKeys.length) {
    return helpers.message('normalized booking requirements must have unique kind/code identities');
  }
  return value;
}, 'normalized booking validation').unknown(false);

const normalizedPageSchema = Joi.object({
  schemaVersion: Joi.string().valid(BOOKING_FEED_SCHEMA_VERSION).required(),
  bookings: Joi.array().items(normalizedBookingSchema).max(100).required(),
  nextCursor: nullableText(2000).required(),
  hasMore: Joi.boolean().required(),
  watermarkAt: isoText.allow(null).required(),
  snapshotComplete: Joi.boolean().required()
}).custom((value, helpers) => {
  if (value.hasMore && !value.nextCursor) return helpers.message('nextCursor is required when hasMore is true');
  if (!value.hasMore && value.nextCursor) return helpers.message('nextCursor must be empty when hasMore is false');
  return value;
}, 'normalized booking page cursor validation').unknown(false);

const readRequestSchema = Joi.object({
  from: isoText.required(),
  to: isoText.required(),
  cursor: nullableText(2000).default(null),
  updatedSince: isoText.allow(null).default(null),
  syncMode: Joi.string().trim().lowercase().valid(...BOOKING_READ_SYNC_MODES).default('hydration'),
  maxPages: Joi.number().integer().min(1).max(50)
}).unknown(false);

const verificationSchema = Joi.object({
  providerKey: boundedText(80).lowercase().required(),
  contractSchemaVersion: Joi.string().valid(BOOKING_FEED_SCHEMA_VERSION).required(),
  accountMatched: Joi.boolean().valid(true).required(),
  locationMatched: Joi.boolean().valid(true).required()
}).unknown(false);

function contractError(code, message) {
  return new BookingReadAdapterContractError(code, message);
}

function normalizeBookingReadRequest(payload) {
  const { error, value } = readRequestSchema.validate(payload || {}, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error) throw contractError('BOOKING_ADAPTER_REQUEST_INVALID', 'Booking adapter read request is invalid.');
  if (new Date(value.to) <= new Date(value.from)) {
    throw contractError('BOOKING_ADAPTER_REQUEST_INVALID', 'Booking adapter read window must end after it starts.');
  }
  if (value.updatedSince && new Date(value.updatedSince) > new Date(value.to)) {
    throw contractError('BOOKING_ADAPTER_REQUEST_INVALID', 'Booking adapter checkpoint must not follow its read window.');
  }
  if (value.syncMode === 'incremental' && !value.updatedSince) {
    throw contractError('BOOKING_ADAPTER_REQUEST_INVALID', 'Incremental booking reads require an update checkpoint.');
  }
  return value;
}

function assertGuestDataMode(booking, guestDataMode) {
  if (guestDataMode === 'NONE' && booking.guest !== null) {
    throw contractError('BOOKING_ADAPTER_GUEST_DATA_EXCEEDED', 'Booking adapter returned guest data outside the configured minimum.');
  }
  if (guestDataMode === 'EXTERNAL_ID' && booking.guest) {
    const identityValues = ['firstName', 'lastName', 'email', 'phone'].map(key => booking.guest[key]);
    if (identityValues.some(value => value !== undefined && value !== null && value !== '')) {
      throw contractError('BOOKING_ADAPTER_GUEST_DATA_EXCEEDED', 'Booking adapter returned guest identity data outside the configured minimum.');
    }
  }
}

function validateNormalizedBookingAdapterPage(payload, {
  externalLocationId,
  guestDataMode = 'NONE',
  syncMode = 'hydration'
} = {}) {
  const normalizedGuestDataMode = String(guestDataMode || '').trim().toUpperCase();
  if (!GUEST_DATA_MODES.includes(normalizedGuestDataMode)) {
    throw contractError('BOOKING_ADAPTER_GUEST_MODE_INVALID', 'Booking adapter guest data mode is invalid.');
  }
  const normalizedSyncMode = String(syncMode || '').trim().toLowerCase();
  if (!BOOKING_READ_SYNC_MODES.includes(normalizedSyncMode)) {
    throw contractError('BOOKING_ADAPTER_SYNC_MODE_INVALID', 'Booking adapter sync mode is invalid.');
  }
  const { error, value } = normalizedPageSchema.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error) {
    throw contractError('BOOKING_ADAPTER_RESPONSE_INVALID', 'Booking adapter response is not a valid normalized Booking page.');
  }
  for (const booking of value.bookings) {
    if (externalLocationId && booking.externalLocationId !== String(externalLocationId)) {
      throw contractError('BOOKING_ADAPTER_LOCATION_MISMATCH', 'Booking adapter returned data for an unconfigured location.');
    }
    assertGuestDataMode(booking, normalizedGuestDataMode);
    if (booking.sourceHash !== bookingSourceHash(booking)) {
      throw contractError('BOOKING_ADAPTER_SOURCE_HASH_INVALID', 'Booking adapter returned a source hash that does not match its normalized facts.');
    }
  }
  if (normalizedSyncMode === 'reconciliation' && !value.hasMore && value.snapshotComplete !== true) {
    throw contractError(
      'BOOKING_ADAPTER_RECONCILIATION_INCOMPLETE',
      'Booking adapter did not attest a complete reconciliation snapshot.'
    );
  }
  return value;
}

function validateBookingAdapterVerification(payload, { providerKey } = {}) {
  const { error, value } = verificationSchema.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error || (providerKey && value.providerKey !== String(providerKey).trim().toLowerCase())) {
    throw contractError('BOOKING_ADAPTER_VERIFICATION_INVALID', 'Booking adapter verification response is invalid.');
  }
  return value;
}

module.exports = {
  BOOKING_READ_ADAPTER_CONTRACT_VERSION,
  BOOKING_READ_SYNC_MODES,
  BookingReadAdapterContractError,
  normalizeBookingReadRequest,
  validateNormalizedBookingAdapterPage,
  validateBookingAdapterVerification
};
