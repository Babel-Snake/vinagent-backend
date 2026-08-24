const axios = require('axios');
const BookingAdapter = require('../booking.adapter');
const { ValidationError } = require('../../../../utils/errors');
const { getAxiosOutboundPolicy } = require('../../../../utils/outboundHttpPolicy');
const {
  BOOKING_FEED_SCHEMA_VERSION,
  GUEST_DATA_MODES,
  validateAndNormalizeBookingPage,
  validateBookingFeedHealth
} = require('../bookingFeed.contract');
const {
  normalizeBookingReadRequest,
  validateNormalizedBookingAdapterPage,
  validateBookingAdapterVerification
} = require('../bookingReadAdapter.contract');

const PROVIDER_KEY = 'vinagent-booking-feed';
const MAX_RESPONSE_BYTES = 1024 * 1024;

class BookingFeedRequestError extends Error {
  constructor(code, message, { permanent = false, authenticationRejected = false } = {}) {
    super(message);
    this.name = 'BookingFeedRequestError';
    this.code = code;
    this.permanent = permanent;
    this.authenticationRejected = authenticationRejected;
  }
}

function allowedBookingFeedHosts(env = process.env) {
  return new Set(String(env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean));
}

function normalizeBookingFeedConfiguration(configuration, { env = process.env } = {}) {
  const config = configuration || {};
  const allowedKeys = new Set(['baseUrl', 'contractVersion', 'shadowMode', 'guestDataMode', 'pageSize']);
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !allowedKeys.has(key))) {
    throw new ValidationError('Booking feed configuration contains unsupported fields');
  }
  let parsed;
  try {
    parsed = new URL(String(config.baseUrl || '').trim());
  } catch {
    throw new ValidationError('Booking feed baseUrl must be an exact HTTPS origin');
  }
  const allowTestHttp = env.NODE_ENV === 'test' && env.INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS === 'true';
  if ((!allowTestHttp && parsed.protocol !== 'https:')
    || (allowTestHttp && !['http:', 'https:'].includes(parsed.protocol))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
    || String(config.baseUrl).trim() !== parsed.origin) {
    throw new ValidationError('Booking feed baseUrl must be an exact HTTPS origin');
  }
  const allowedHosts = allowedBookingFeedHosts(env);
  if (allowedHosts.size === 0 || !allowedHosts.has(parsed.host.toLowerCase())) {
    throw new ValidationError('Booking feed host is not operator allowlisted');
  }
  if (config.contractVersion !== '1') throw new ValidationError('Booking feed contractVersion must be 1');
  if (config.shadowMode !== true) throw new ValidationError('Booking feed connections must remain in shadowMode');
  const guestDataMode = String(config.guestDataMode || 'NONE').trim().toUpperCase();
  if (!GUEST_DATA_MODES.includes(guestDataMode)) throw new ValidationError('Booking feed guestDataMode is not supported');
  const pageSize = Number(config.pageSize ?? 100);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ValidationError('Booking feed pageSize must be between 1 and 100');
  }
  return {
    baseUrl: parsed.origin,
    contractVersion: '1',
    shadowMode: true,
    guestDataMode,
    pageSize
  };
}

function buildCredentialHeaders(credential) {
  if (credential.credentialType === 'BEARER_TOKEN') {
    return { Authorization: `Bearer ${credential.secret.token}` };
  }
  if (credential.credentialType === 'API_KEY') {
    return { 'X-API-Key': credential.secret.apiKey };
  }
  throw new ValidationError('VinAgent Booking Feed supports BEARER_TOKEN or API_KEY credentials');
}

function translateRequestError(error) {
  if (error instanceof BookingFeedRequestError || error.code === 'BOOKING_FEED_SCHEMA_INVALID') return error;
  const status = Number(error.response?.status || 0);
  if ([401, 403].includes(status)) {
    return new BookingFeedRequestError(
      'BOOKING_FEED_AUTHENTICATION_REJECTED',
      'Booking feed rejected the configured credential.',
      { permanent: true, authenticationRejected: true }
    );
  }
  if (status === 404) {
    return new BookingFeedRequestError('BOOKING_FEED_ENDPOINT_NOT_FOUND', 'Booking feed endpoint was not found.', { permanent: true });
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return new BookingFeedRequestError('BOOKING_FEED_REQUEST_REJECTED', 'Booking feed rejected the read request.', { permanent: true });
  }
  if (status === 429) return new BookingFeedRequestError('BOOKING_FEED_RATE_LIMITED', 'Booking feed rate limit reached.');
  if (status >= 500) return new BookingFeedRequestError('BOOKING_FEED_UNAVAILABLE', 'Booking feed is temporarily unavailable.');
  return new BookingFeedRequestError('BOOKING_FEED_NETWORK_ERROR', 'Booking feed could not be reached.');
}

class VinAgentBookingFeedProvider extends BookingAdapter {
  constructor({ configuration, credential, externalLocationId, env = process.env, httpClient = axios }) {
    const normalizedConfiguration = normalizeBookingFeedConfiguration(configuration, { env });
    super(normalizedConfiguration);
    if (!externalLocationId || String(externalLocationId).length > 255) {
      throw new ValidationError('Booking feed connection requires externalLocationId');
    }
    this.externalLocationId = String(externalLocationId);
    this.headers = {
      Accept: 'application/json',
      ...buildCredentialHeaders(credential)
    };
    this.httpClient = httpClient;
  }

  isAuthenticated() {
    return true;
  }

  async get(path, params = {}) {
    try {
      return await this.httpClient.get(`${this.config.baseUrl}${path}`, {
        ...getAxiosOutboundPolicy(),
        headers: this.headers,
        params,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES
      });
    } catch (error) {
      throw translateRequestError(error);
    }
  }

  async verifyReadAccess() {
    const response = await this.get('/v1/health');
    const health = validateBookingFeedHealth(response.data);
    if (!health.locations.some(location => location.id === this.externalLocationId)) {
      throw new BookingFeedRequestError(
        'BOOKING_FEED_LOCATION_NOT_AVAILABLE',
        'Configured booking location is not available to this credential.',
        { permanent: true }
      );
    }
    return validateBookingAdapterVerification({
      providerKey: PROVIDER_KEY,
      contractSchemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      accountMatched: true,
      locationMatched: true
    }, { providerKey: PROVIDER_KEY });
  }

  async fetchBookingsPage(request) {
    const { from, to, cursor, updatedSince, syncMode } = normalizeBookingReadRequest(request);
    const response = await this.get('/v1/bookings', {
      location_id: this.externalLocationId,
      from,
      to,
      updated_since: updatedSince || undefined,
      sync_mode: syncMode,
      cursor: cursor || undefined,
      limit: this.config.pageSize
    });
    const page = validateAndNormalizeBookingPage(response.data, {
      guestDataMode: this.config.guestDataMode
    });
    if (page.bookings.some(booking => booking.externalLocationId !== this.externalLocationId)) {
      throw new BookingFeedRequestError(
        'BOOKING_FEED_LOCATION_MISMATCH',
        'Booking feed returned data for an unconfigured location.',
        { permanent: true }
      );
    }
    if (syncMode === 'reconciliation' && !page.hasMore && page.snapshotComplete !== true) {
      throw new BookingFeedRequestError(
        'BOOKING_FEED_RECONCILIATION_INCOMPLETE',
        'Booking feed did not attest a complete reconciliation snapshot.',
        { permanent: true }
      );
    }
    return validateNormalizedBookingAdapterPage(page, {
      externalLocationId: this.externalLocationId,
      guestDataMode: this.config.guestDataMode,
      syncMode
    });
  }
}

module.exports = {
  PROVIDER_KEY,
  BookingFeedRequestError,
  VinAgentBookingFeedProvider,
  allowedBookingFeedHosts,
  normalizeBookingFeedConfiguration,
  buildCredentialHeaders,
  translateRequestError
};
