const crypto = require('crypto');
const axios = require('axios');
const Joi = require('joi');
const { ValidationError } = require('../../../../utils/errors');
const { getAxiosOutboundPolicy } = require('../../../../utils/outboundHttpPolicy');
const { stableSerialize } = require('../../../integrationDataFoundation.service');
const { BOOKING_FEED_SCHEMA_VERSION, GUEST_DATA_MODES } = require('../bookingFeed.contract');
const { BookingReadAdapterContractError } = require('../bookingReadAdapter.contract');
const { defineNativeBookingTranslator, NativeBookingReadAdapter } = require('../nativeBookingAdapter');

const PROVIDER_KEY = 'opentable';
const OPENTABLE_SYNC_PATH = '/sync/v2/reservations';
const OPENTABLE_TOKEN_PATH = '/api/v2/oauth/token';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const STATUS_MAP = Object.freeze({
  pending: 'PENDING',
  unconfirmed: 'PENDING',
  confirmed: 'CONFIRMED',
  booked: 'CONFIRMED',
  arrived: 'SEATED',
  'partially arrived': 'SEATED',
  seated: 'SEATED',
  done: 'COMPLETED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  'no show': 'NO_SHOW',
  'no-show': 'NO_SHOW',
  noshow: 'NO_SHOW'
});

class OpenTableSyncRequestError extends Error {
  constructor(code, message, { permanent = false, authenticationRejected = false } = {}) {
    super(message);
    this.name = 'OpenTableSyncRequestError';
    this.code = code;
    this.permanent = permanent;
    this.authenticationRejected = authenticationRejected;
  }
}

const experienceMappingSchema = Joi.object({
  externalId: Joi.string().trim().min(1).max(120).required(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9._-]*$/).max(120).required(),
  name: Joi.string().trim().min(1).max(200).required(),
  durationMinutes: Joi.number().integer().min(1).max(1440).allow(null).default(null)
}).unknown(false);

const addOnMappingSchema = Joi.object({
  externalId: Joi.string().trim().min(1).max(120).required(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9._-]*$/).max(120).required(),
  label: Joi.string().trim().min(1).max(255).required(),
  kind: Joi.string().trim().uppercase().valid('ADD_ON', 'OTHER').default('ADD_ON')
}).unknown(false);

const visitTagMappingSchema = Joi.object({
  externalValue: Joi.string().trim().min(1).max(255).required(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9._-]*$/).max(120).required(),
  label: Joi.string().trim().min(1).max(255).required(),
  kind: Joi.string().trim().uppercase().valid('DIETARY', 'ACCESSIBILITY', 'SEATING', 'OTHER').required()
}).unknown(false);

const configurationSchema = Joi.object({
  apiBaseUrl: Joi.string().trim().max(500).required(),
  oauthBaseUrl: Joi.string().trim().max(500).required(),
  contractVersion: Joi.string().valid('1').required(),
  shadowMode: Joi.boolean().valid(true).required(),
  guestDataMode: Joi.string().trim().uppercase().valid(...GUEST_DATA_MODES).default('NONE'),
  pageSize: Joi.number().integer().min(1).max(100).default(100),
  timeZone: Joi.string().trim().min(1).max(80).required(),
  experienceMappings: Joi.array().items(experienceMappingSchema).max(200).default([]),
  addOnMappings: Joi.array().items(addOnMappingSchema).max(500).default([]),
  visitTagMappings: Joi.array().items(visitTagMappingSchema).max(500).default([])
}).unknown(false);

const addOnSchema = Joi.object({
  ItemID: Joi.string().trim().min(1).max(120).required(),
  Quantity: Joi.number().integer().min(1).max(10000).required(),
  Name: Joi.string().trim().max(255).allow('', null),
  Description: Joi.string().max(2000).allow('', null)
}).unknown(true);

const reservationSchema = Joi.object({
  id: Joi.alternatives().try(Joi.string().trim().min(1).max(255), Joi.number()).required(),
  sequence_id: Joi.alternatives().try(Joi.string().trim().min(1).max(120), Joi.number()).required(),
  rid: Joi.alternatives().try(Joi.string().trim().pattern(/^\d+$/), Joi.number().integer().positive()).required(),
  guest_id: Joi.alternatives().try(Joi.string().trim().max(255), Joi.number()).allow(null),
  state: Joi.string().trim().min(1).max(80).required(),
  scheduled_time_utc: Joi.string().isoDate().required(),
  party_size: Joi.number().integer().min(1).max(10000).required(),
  updated_at_utc: Joi.string().isoDate().required(),
  created_date_utc: Joi.string().isoDate().allow(null),
  visit_tags: Joi.array().items(Joi.string().trim().max(255)).max(50).default([]),
  experience_details: Joi.object({
    experience_id: Joi.alternatives().try(Joi.string().trim().max(120), Joi.number()).required(),
    experience_title: Joi.string().trim().max(500).allow('', null),
    add_ons: Joi.array().items(addOnSchema).max(100).allow(null).default([])
  }).unknown(true).allow(null)
}).unknown(true);

const reservationPageSchema = Joi.object({
  hasNextPage: Joi.boolean().required(),
  nextPageUrl: Joi.string().uri().max(2000).allow('', null),
  offset: Joi.number().integer().min(0).required(),
  limit: Joi.number().integer().min(1).max(2000).required(),
  items: Joi.array().items(reservationSchema).max(100).required()
}).unknown(true);

const rawEnvelopeSchema = Joi.object({
  payload: reservationPageSchema.required(),
  observedAt: Joi.string().isoDate().required()
}).unknown(false);

const tokenResponseSchema = Joi.object({
  access_token: Joi.string().min(1).max(8192).required(),
  expires_in: Joi.number().integer().min(1).max(86400).default(300),
  token_type: Joi.string().trim().max(40).allow('', null)
}).unknown(true);

function allowedOpenTableHosts(env = process.env) {
  return new Set(String(env.INTEGRATION_OPENTABLE_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean));
}

function normalizeExactOrigin(value, { env, allowedHosts }) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new ValidationError('OpenTable endpoints must be exact HTTPS origins');
  }
  const allowTestHttp = env.NODE_ENV === 'test' && env.INTEGRATION_OPENTABLE_ALLOW_HTTP_FOR_TESTS === 'true';
  if ((!allowTestHttp && parsed.protocol !== 'https:')
    || (allowTestHttp && !['http:', 'https:'].includes(parsed.protocol))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
    || String(value).trim() !== parsed.origin) {
    throw new ValidationError('OpenTable endpoints must be exact HTTPS origins');
  }
  if (!allowedHosts.has(parsed.host.toLowerCase())) {
    throw new ValidationError('OpenTable endpoint host is not operator allowlisted');
  }
  return parsed.origin;
}

function assertUniqueMappings(mappings, label) {
  const externalIds = mappings.map(mapping => mapping.externalId);
  if (new Set(externalIds).size !== externalIds.length) {
    throw new ValidationError(`OpenTable ${label} mappings require unique externalId values`);
  }
}

function normalizeOpenTableConfiguration(configuration, { env = process.env } = {}) {
  const { error, value } = configurationSchema.validate(configuration || {}, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error) throw new ValidationError('OpenTable Sync configuration is invalid');
  const hosts = allowedOpenTableHosts(env);
  if (hosts.size === 0) throw new ValidationError('OpenTable requires an operator host allowlist');
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value.timeZone }).format(new Date());
  } catch {
    throw new ValidationError('OpenTable timeZone must be a valid IANA time zone');
  }
  assertUniqueMappings(value.experienceMappings, 'experience');
  assertUniqueMappings(value.addOnMappings, 'add-on');
  const visitTagKeys = value.visitTagMappings.map(mapping => mapping.externalValue.toLowerCase());
  if (new Set(visitTagKeys).size !== visitTagKeys.length) {
    throw new ValidationError('OpenTable visit-tag mappings require unique externalValue values');
  }
  return {
    ...value,
    apiBaseUrl: normalizeExactOrigin(value.apiBaseUrl, { env, allowedHosts: hosts }),
    oauthBaseUrl: normalizeExactOrigin(value.oauthBaseUrl, { env, allowedHosts: hosts })
  };
}

function normalizeUtcTimestamp(value, fieldName) {
  const text = String(value || '').trim();
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) {
    throw new BookingReadAdapterContractError('OPENTABLE_TIMESTAMP_INVALID', `OpenTable ${fieldName} is invalid.`);
  }
  return parsed.toISOString();
}

function formatOpenTableLocalTimestamp(value, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function mapOpenTableStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('_', ' ');
  const mapped = STATUS_MAP[normalized];
  if (!mapped) {
    throw new BookingReadAdapterContractError(
      'OPENTABLE_STATUS_UNSUPPORTED',
      'OpenTable returned a reservation state that has not been reviewed.'
    );
  }
  return mapped;
}

function validateRawEnvelope(rawPage) {
  const { error, value } = rawEnvelopeSchema.validate(rawPage, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error) {
    throw new BookingReadAdapterContractError(
      'OPENTABLE_RESPONSE_SCHEMA_INVALID',
      'OpenTable reservation response did not match the reviewed Sync API shape.'
    );
  }
  return value;
}

function buildProviderContext(configuration) {
  return {
    experienceMappings: new Map(configuration.experienceMappings.map(mapping => [mapping.externalId, mapping])),
    addOnMappings: new Map(configuration.addOnMappings.map(mapping => [mapping.externalId, mapping])),
    visitTagMappings: new Map(configuration.visitTagMappings
      .map(mapping => [mapping.externalValue.toLowerCase(), mapping]))
  };
}

function mapExperience(experienceDetails, providerContext) {
  if (!experienceDetails) return null;
  const mapping = providerContext?.experienceMappings?.get(String(experienceDetails.experience_id));
  if (!mapping) {
    throw new BookingReadAdapterContractError(
      'OPENTABLE_EXPERIENCE_MAPPING_REQUIRED',
      'OpenTable experience requires a reviewed winery-owned mapping.'
    );
  }
  return { code: mapping.code, name: mapping.name };
}

function mapRequirements(experienceDetails, visitTags, providerContext) {
  const aggregated = new Map();
  const addRequirement = requirement => {
    const key = `${requirement.kind}:${requirement.code}`;
    const existing = aggregated.get(key);
    aggregated.set(key, {
      ...requirement,
      quantity: Number(existing?.quantity || 0) + Number(requirement.quantity)
    });
  };
  for (const addOn of experienceDetails?.add_ons || []) {
    const mapping = providerContext?.addOnMappings?.get(String(addOn.ItemID));
    if (!mapping) {
      throw new BookingReadAdapterContractError(
        'OPENTABLE_ADD_ON_MAPPING_REQUIRED',
        'OpenTable selected add-on requires a reviewed winery-owned mapping.'
      );
    }
    addRequirement({
      kind: mapping.kind,
      code: mapping.code,
      label: mapping.label,
      quantity: Number(addOn.Quantity)
    });
  }
  for (const visitTag of visitTags || []) {
    const mapping = providerContext?.visitTagMappings?.get(String(visitTag).trim().toLowerCase());
    if (!mapping) continue;
    addRequirement({
      kind: mapping.kind,
      code: mapping.code,
      label: mapping.label,
      quantity: 1
    });
  }
  return [...aggregated.values()].sort((left, right) => (
    `${left.kind}:${left.code}`.localeCompare(`${right.kind}:${right.code}`)
  ));
}

function buildRevision(reservation, normalizedFacts) {
  const digest = crypto.createHash('sha256').update(stableSerialize({
    sequenceId: String(reservation.sequence_id),
    ...normalizedFacts
  })).digest('hex').slice(0, 24);
  return `ot:${normalizedFacts.updatedAt}:${digest}`;
}

const openTableTranslator = defineNativeBookingTranslator({
  providerKey: PROVIDER_KEY,
  adapterVersion: '1',
  paginationStrategy: 'OFFSET',
  supportedSyncModes: ['hydration', 'incremental', 'reconciliation'],
  kind: 'NATIVE_PROVIDER',
  translatePage(rawPage, { request, providerContext }) {
    const { payload, observedAt } = validateRawEnvelope(rawPage);
    const requestedOffset = request.cursor ? Number(request.cursor) : 0;
    if (payload.offset !== requestedOffset) {
      throw new BookingReadAdapterContractError(
        'OPENTABLE_OFFSET_MISMATCH',
        'OpenTable response offset did not match the requested page.'
      );
    }
    if (payload.hasNextPage && payload.items.length === 0) {
      throw new BookingReadAdapterContractError(
        'OPENTABLE_PAGINATION_STALLED',
        'OpenTable reported another page without returning cursor progress.'
      );
    }
    return {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: payload.items.map(reservation => {
        const status = mapOpenTableStatus(reservation.state);
        const updatedAt = normalizeUtcTimestamp(reservation.updated_at_utc, 'updated_at_utc');
        const startAt = normalizeUtcTimestamp(reservation.scheduled_time_utc, 'scheduled_time_utc');
        const experienceMapping = reservation.experience_details
          ? providerContext?.experienceMappings?.get(String(reservation.experience_details.experience_id))
          : null;
        const experience = mapExperience(reservation.experience_details, providerContext);
        const requirements = mapRequirements(reservation.experience_details, reservation.visit_tags, providerContext);
        const endAt = experienceMapping?.durationMinutes
          ? new Date(new Date(startAt).getTime() + experienceMapping.durationMinutes * 60000).toISOString()
          : null;
        const normalizedFacts = {
          status,
          startAt,
          endAt,
          partySize: reservation.party_size,
          experience,
          requirements,
          updatedAt
        };
        return {
          id: String(reservation.id),
          revision: buildRevision(reservation, normalizedFacts),
          status,
          startAt,
          endAt,
          partySize: reservation.party_size,
          locationId: String(reservation.rid),
          experience,
          requirements,
          guest: reservation.guest_id == null ? null : { externalId: String(reservation.guest_id) },
          createdAt: reservation.created_date_utc
            ? normalizeUtcTimestamp(reservation.created_date_utc, 'created_date_utc')
            : null,
          updatedAt,
          deletedAt: status === 'CANCELLED' ? updatedAt : null
        };
      }),
      nextCursor: payload.hasNextPage ? String(payload.offset + payload.items.length) : null,
      hasMore: payload.hasNextPage,
      watermarkAt: observedAt,
      snapshotComplete: request.syncMode === 'reconciliation' && payload.hasNextPage === false
    };
  }
});

function translateOpenTableRequestError(error, { authenticationRequest = false } = {}) {
  if (error instanceof OpenTableSyncRequestError || error instanceof BookingReadAdapterContractError) return error;
  const status = Number(error.response?.status || 0);
  if ([401, 403].includes(status) || (authenticationRequest && status === 400)) {
    return new OpenTableSyncRequestError(
      'OPENTABLE_AUTHENTICATION_REJECTED',
      'OpenTable rejected the configured partner credential.',
      { permanent: true, authenticationRejected: true }
    );
  }
  if (status === 404) {
    return new OpenTableSyncRequestError(
      'OPENTABLE_SYNC_ENDPOINT_NOT_FOUND',
      'OpenTable Sync endpoint or restaurant was not found.',
      { permanent: true }
    );
  }
  if (status === 429) return new OpenTableSyncRequestError('OPENTABLE_RATE_LIMITED', 'OpenTable rate limit reached.');
  if (status >= 400 && status < 500) {
    return new OpenTableSyncRequestError('OPENTABLE_REQUEST_REJECTED', 'OpenTable rejected the read request.', { permanent: true });
  }
  if (status >= 500) return new OpenTableSyncRequestError('OPENTABLE_UNAVAILABLE', 'OpenTable Sync is temporarily unavailable.');
  return new OpenTableSyncRequestError('OPENTABLE_NETWORK_ERROR', 'OpenTable Sync could not be reached.');
}

class OpenTableSyncProvider extends NativeBookingReadAdapter {
  constructor({ configuration, credential, externalLocationId, env = process.env, httpClient = axios, now = () => new Date() }) {
    const normalizedConfiguration = normalizeOpenTableConfiguration(configuration, { env });
    if (!/^\d{1,20}$/.test(String(externalLocationId || ''))) {
      throw new ValidationError('OpenTable connection requires a numeric restaurant ID');
    }
    if (credential?.credentialType !== 'OAUTH_CLIENT_CREDENTIALS'
      || !credential.secret?.clientId || !credential.secret?.clientSecret) {
      throw new ValidationError('OpenTable Sync requires OAuth client credentials');
    }
    super({
      translator: openTableTranslator,
      configuration: normalizedConfiguration,
      externalLocationId: String(externalLocationId),
      guestDataMode: normalizedConfiguration.guestDataMode,
      providerContext: buildProviderContext(normalizedConfiguration)
    });
    this.credential = credential;
    this.httpClient = httpClient;
    this.now = now;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  isAuthenticated() {
    return true;
  }

  async getAccessToken() {
    const now = new Date(this.now()).getTime();
    if (this.accessToken && now < this.accessTokenExpiresAt) return this.accessToken;
    try {
      const response = await this.httpClient.post(
        `${this.config.oauthBaseUrl}${OPENTABLE_TOKEN_PATH}`,
        null,
        {
          ...getAxiosOutboundPolicy(),
          auth: {
            username: this.credential.secret.clientId,
            password: this.credential.secret.clientSecret
          },
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          params: { grant_type: 'client_credentials' },
          maxContentLength: MAX_RESPONSE_BYTES,
          maxBodyLength: MAX_RESPONSE_BYTES
        }
      );
      const { error, value } = tokenResponseSchema.validate(response.data, {
        abortEarly: false,
        convert: true,
        stripUnknown: false
      });
      if (error) {
        throw new OpenTableSyncRequestError(
          'OPENTABLE_TOKEN_RESPONSE_INVALID',
          'OpenTable token response was invalid.',
          { permanent: true }
        );
      }
      this.accessToken = value.access_token;
      this.accessTokenExpiresAt = now + Math.max(1, value.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (error) {
      throw translateOpenTableRequestError(error, { authenticationRequest: true });
    }
  }

  async requestReservations(params) {
    const token = await this.getAccessToken();
    try {
      const response = await this.httpClient.get(`${this.config.apiBaseUrl}${OPENTABLE_SYNC_PATH}`, {
        ...getAxiosOutboundPolicy(),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        params,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES
      });
      return {
        payload: response.data,
        observedAt: new Date(this.now()).toISOString()
      };
    } catch (error) {
      throw translateOpenTableRequestError(error);
    }
  }

  requestParams(request, { limit = this.config.pageSize } = {}) {
    const offsetText = request.cursor || '0';
    if (!/^\d{1,10}$/.test(offsetText)) {
      throw new BookingReadAdapterContractError('OPENTABLE_CURSOR_INVALID', 'OpenTable page cursor is invalid.');
    }
    return {
      rid: this.externalLocationId,
      scheduled_time_from: formatOpenTableLocalTimestamp(request.from, this.config.timeZone),
      scheduled_time_to: formatOpenTableLocalTimestamp(request.to, this.config.timeZone),
      updated_after: request.syncMode === 'incremental' ? request.updatedSince || undefined : undefined,
      limit,
      offset: Number(offsetText)
    };
  }

  async verifyReadAccess() {
    const now = new Date(this.now());
    const from = now.toISOString();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const rawPage = await this.requestReservations(this.requestParams({
      from,
      to,
      cursor: null,
      updatedSince: null,
      syncMode: 'hydration'
    }, { limit: 1 }));
    const { payload } = validateRawEnvelope(rawPage);
    if (payload.items.some(item => String(item.rid) !== this.externalLocationId)) {
      throw new OpenTableSyncRequestError(
        'OPENTABLE_LOCATION_MISMATCH',
        'OpenTable returned a reservation outside the configured restaurant.',
        { permanent: true }
      );
    }
    return {
      providerKey: PROVIDER_KEY,
      contractSchemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      accountMatched: true,
      locationMatched: true
    };
  }

  async fetchProviderBookingsPage(request) {
    return this.requestReservations(this.requestParams(request));
  }
}

module.exports = {
  PROVIDER_KEY,
  OPENTABLE_SYNC_PATH,
  OPENTABLE_TOKEN_PATH,
  STATUS_MAP,
  OpenTableSyncRequestError,
  openTableTranslator,
  allowedOpenTableHosts,
  normalizeOpenTableConfiguration,
  normalizeUtcTimestamp,
  formatOpenTableLocalTimestamp,
  mapOpenTableStatus,
  validateRawEnvelope,
  buildProviderContext,
  mapExperience,
  mapRequirements,
  translateOpenTableRequestError,
  OpenTableSyncProvider
};
