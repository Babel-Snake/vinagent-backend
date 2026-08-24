const crypto = require('crypto');
const Joi = require('joi');
const AppError = require('../utils/AppError');
const { ValidationError } = require('../utils/errors');
const { INTEGRATION_DOMAINS } = require('./integrationDataRegistry.service');

const WEBHOOK_CHANGE_HINT_SCHEMA_VERSION = 'vinagent.webhook-change-hint.v1';
const WEBHOOK_ADAPTER_CONTRACT_VERSION = 'vinagent.integration-webhook-adapter.v1';
const WEBHOOK_CHANGE_KINDS = Object.freeze(['UPSERT', 'DELETE', 'UNKNOWN']);
const DEFAULT_MAX_AGE_SECONDS = 300;

class IntegrationWebhookAuthenticationError extends AppError {
  constructor(code = 'PROVIDER_WEBHOOK_AUTHENTICATION_FAILED') {
    super('Provider webhook authentication failed.', 401, code);
    this.permanent = true;
  }
}

const stableKey = (max, casing = 'lowercase') => {
  let schema = Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(max);
  schema = casing === 'uppercase' ? schema.uppercase() : schema.lowercase();
  return schema;
};

const changeHintSchema = Joi.object({
  schemaVersion: Joi.string().valid(WEBHOOK_CHANGE_HINT_SCHEMA_VERSION).required(),
  eventId: Joi.string().trim().min(1).max(255).required(),
  eventType: stableKey(120).required(),
  occurredAt: Joi.string().isoDate().allow(null).default(null),
  providerEventVersion: Joi.string().trim().max(120).allow('', null).default(null),
  correlationId: Joi.string().trim().max(120).allow('', null).default(null),
  changes: Joi.array().items(Joi.object({
    resourceType: stableKey(40, 'uppercase').valid(...INTEGRATION_DOMAINS).required(),
    externalId: Joi.string().trim().min(1).max(255).allow(null).default(null),
    changeKind: Joi.string().trim().uppercase().valid(...WEBHOOK_CHANGE_KINDS).default('UNKNOWN')
  }).unknown(false)).min(1).max(20).required()
}).unknown(false);

function timingSafeHexEqual(candidate, expected) {
  const normalized = String(candidate || '').trim().replace(/^sha256=/i, '');
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const candidateBuffer = Buffer.from(normalized, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return candidateBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function singleHeader(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeChangeHint(payload, { domain }) {
  const { error, value } = changeHintSchema.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (error || value.changes.some(change => change.resourceType !== domain)) {
    const validationError = new ValidationError('Provider webhook change hint is invalid');
    validationError.code = 'PROVIDER_WEBHOOK_PAYLOAD_INVALID';
    validationError.permanent = true;
    throw validationError;
  }
  return value;
}

function defineIntegrationWebhookAdapter(definition) {
  const allowedKeys = new Set([
    'adapterKey', 'adapterVersion', 'contractVersion', 'supportedDomains',
    'verificationScheme', 'createVerificationMaterial', 'verifyAndNormalize'
  ]);
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)
    || Object.keys(definition).some(key => !allowedKeys.has(key))) {
    throw new ValidationError('Integration webhook adapter definition contains unsupported fields');
  }
  const adapterKey = String(definition.adapterKey || '').trim().toLowerCase();
  const adapterVersion = String(definition.adapterVersion || '').trim();
  const supportedDomains = [...new Set((definition.supportedDomains || [])
    .map(domain => String(domain).trim().toUpperCase()))];
  if (!/^[a-z0-9][a-z0-9._-]{1,118}[a-z0-9]$/.test(adapterKey)
    || !/^[1-9][0-9]{0,8}$/.test(adapterVersion)
    || definition.contractVersion !== WEBHOOK_ADAPTER_CONTRACT_VERSION
    || supportedDomains.length === 0
    || supportedDomains.some(domain => domain !== '*' && !INTEGRATION_DOMAINS.includes(domain))
    || typeof definition.createVerificationMaterial !== 'function'
    || typeof definition.verifyAndNormalize !== 'function') {
    throw new ValidationError('Integration webhook adapter definition is invalid');
  }
  return Object.freeze({
    ...definition,
    adapterKey,
    adapterVersion,
    supportedDomains: Object.freeze(supportedDomains)
  });
}

function createVinAgentHmacChangeHintAdapter() {
  return defineIntegrationWebhookAdapter({
    adapterKey: 'vinagent.hmac-change-hint',
    adapterVersion: '1',
    contractVersion: WEBHOOK_ADAPTER_CONTRACT_VERSION,
    supportedDomains: ['*'],
    verificationScheme: 'HMAC_SHA256_TIMESTAMPED',
    createVerificationMaterial() {
      const secret = crypto.randomBytes(32).toString('base64url');
      return { stored: { secret }, disclosure: { secret } };
    },
    verifyAndNormalize({ rawBody, headers, verificationMaterial, domain, configuration = {}, now = new Date() }) {
      if (!Buffer.isBuffer(rawBody)) {
        throw new AppError('Provider webhook raw request body is unavailable.', 500, 'PROVIDER_WEBHOOK_RAW_BODY_UNAVAILABLE');
      }
      const maxAgeSeconds = Number(configuration.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS);
      if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 30 || maxAgeSeconds > 3600) {
        throw new ValidationError('Webhook endpoint maxAgeSeconds must be between 30 and 3600');
      }
      const timestamp = String(singleHeader(headers, 'x-vinagent-webhook-timestamp') || '').trim();
      const signature = singleHeader(headers, 'x-vinagent-webhook-signature');
      if (!/^\d{10}$/.test(timestamp) || !signature) throw new IntegrationWebhookAuthenticationError();
      const timestampMs = Number(timestamp) * 1000;
      if (!Number.isSafeInteger(timestampMs) || Math.abs(now.getTime() - timestampMs) > maxAgeSeconds * 1000) {
        throw new IntegrationWebhookAuthenticationError('PROVIDER_WEBHOOK_TIMESTAMP_INVALID');
      }
      const expected = crypto.createHmac('sha256', verificationMaterial?.secret || '')
        .update(timestamp, 'utf8')
        .update('.', 'utf8')
        .update(rawBody)
        .digest('hex');
      if (!timingSafeHexEqual(signature, expected)) throw new IntegrationWebhookAuthenticationError();
      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        const error = new ValidationError('Provider webhook body must be valid JSON');
        error.code = 'PROVIDER_WEBHOOK_PAYLOAD_INVALID';
        error.permanent = true;
        throw error;
      }
      return normalizeChangeHint(payload, { domain });
    }
  });
}

module.exports = {
  WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
  WEBHOOK_ADAPTER_CONTRACT_VERSION,
  WEBHOOK_CHANGE_KINDS,
  DEFAULT_MAX_AGE_SECONDS,
  IntegrationWebhookAuthenticationError,
  normalizeChangeHint,
  defineIntegrationWebhookAdapter,
  createVinAgentHmacChangeHintAdapter
};
