const crypto = require('crypto');
const Joi = require('joi');
const { ValidationError } = require('../../utils/errors');
const { stableSerialize } = require('../integrationDataFoundation.service');
const {
  CANONICAL_RESOURCE_TYPES,
  INTEGRATION_DOMAINS
} = require('../integrationDataRegistry.service');
const { CREDENTIAL_TYPES } = require('../integrationCredential.service');

const DOMAIN_CONNECTOR_CONTRACT_VERSION = '1';
const FORBIDDEN_CREDENTIAL_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization)/i;
const stableLowerKey = Joi.string().trim().lowercase()
  .pattern(/^[a-z0-9][a-z0-9._-]*$/);
const manifestSchema = Joi.object({
  connectorKey: stableLowerKey.max(160).required(),
  providerKey: stableLowerKey.max(120).required(),
  domain: Joi.string().uppercase().valid(...INTEGRATION_DOMAINS).required(),
  contractVersion: Joi.string().valid(DOMAIN_CONNECTOR_CONTRACT_VERSION).required(),
  adapterVersion: Joi.string().trim().max(40).required(),
  adapterKind: Joi.string().uppercase().valid('NATIVE_PROVIDER', 'GATEWAY', 'CONFORMANCE_FIXTURE').required(),
  resourceTypes: Joi.array().items(
    Joi.string().uppercase().valid(...CANONICAL_RESOURCE_TYPES)
  ).min(1).unique().required(),
  supportedCredentialTypes: Joi.array().items(
    Joi.string().uppercase().valid(...CREDENTIAL_TYPES)
  ).unique().required(),
  supportsPolling: Joi.boolean().required(),
  supportsWebhook: Joi.boolean().required(),
  readCapabilityKey: stableLowerKey.max(160).required()
}).or('supportsPolling', 'supportsWebhook').custom((value, helpers) => {
  if (!value.supportsPolling && !value.supportsWebhook) {
    return helpers.error('any.custom', { message: 'At least one connector transport is required' });
  }
  return value;
}).unknown(false);

const verificationSchema = Joi.object({
  status: Joi.string().valid('CONNECTED').required(),
  checkedAt: Joi.date().iso().required(),
  capability: Joi.object({
    capabilityKey: stableLowerKey.max(160).required(),
    contractVersion: Joi.string().trim().max(40).required(),
    availabilityStatus: Joi.string().valid('AVAILABLE').required(),
    supportsPolling: Joi.boolean().required(),
    supportsWebhook: Joi.boolean().required()
  }).unknown(false).required()
}).unknown(false);

const normalizedChangeSchema = Joi.object({
  resourceType: Joi.string().uppercase().valid(...CANONICAL_RESOURCE_TYPES).required(),
  externalId: Joi.string().trim().min(1).max(512).required(),
  eventKey: Joi.string().trim().min(1).max(255).required(),
  eventType: stableLowerKey.max(160).required(),
  schemaVersion: Joi.string().trim().max(80).required(),
  occurredAt: Joi.date().iso().required(),
  providerUpdatedAt: Joi.date().iso().required(),
  projectionPayload: Joi.object().unknown(true).required()
}).unknown(false);

const changePageSchema = Joi.object({
  changes: Joi.array().items(normalizedChangeSchema).max(1000).required(),
  nextCursor: Joi.string().max(4096).allow(null).required(),
  hasMore: Joi.boolean().required(),
  watermarkAt: Joi.date().iso().required(),
  snapshotComplete: Joi.boolean().required()
}).unknown(false);

function contractError(message, details = null) {
  const error = new ValidationError(message);
  error.code = 'DOMAIN_CONNECTOR_CONTRACT_INVALID';
  if (details) error.details = details;
  return error;
}

function validate(schema, value, label) {
  const result = schema.validate(value, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });
  if (result.error) {
    throw contractError(`${label} does not satisfy the domain connector contract`,
      result.error.details.map(detail => detail.message));
  }
  return result.value;
}

function assertNoCredentialMaterial(value, path = 'result') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialMaterial(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CREDENTIAL_KEY.test(key)) {
      throw contractError(`${path}.${key} contains forbidden credential material`);
    }
    assertNoCredentialMaterial(child, `${path}.${key}`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function defineDomainConnectorManifest(value) {
  const manifest = validate(manifestSchema, value, 'Connector manifest');
  if (manifest.adapterKind !== 'CONFORMANCE_FIXTURE' && /(?:fixture|mock|test)/i.test(manifest.providerKey)) {
    throw contractError('Runtime connector manifests cannot use a fixture provider key');
  }
  return Object.freeze({
    ...manifest,
    resourceTypes: Object.freeze([...manifest.resourceTypes].sort()),
    supportedCredentialTypes: Object.freeze([...manifest.supportedCredentialTypes].sort())
  });
}

function assertDomainConnectorAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw contractError('Connector adapter must be an object');
  const manifest = defineDomainConnectorManifest(adapter.manifest);
  for (const method of ['verifyConnection', 'readChanges']) {
    if (typeof adapter[method] !== 'function') {
      throw contractError(`Connector adapter must implement ${method}()`);
    }
  }
  return manifest;
}

async function verifyDomainConnector({ adapter, context }) {
  const manifest = assertDomainConnectorAdapter(adapter);
  const input = deepFreeze(structuredClone(context || {}));
  const result = validate(
    verificationSchema,
    await adapter.verifyConnection(input),
    'Connection verification result'
  );
  assertNoCredentialMaterial(result);
  if (result.capability.capabilityKey !== manifest.readCapabilityKey) {
    throw contractError('Verification capability does not match the connector manifest');
  }
  if (
    result.capability.supportsPolling !== manifest.supportsPolling
    || result.capability.supportsWebhook !== manifest.supportsWebhook
  ) throw contractError('Verification transports do not match the connector manifest');
  return result;
}

async function readDomainConnectorChanges({ adapter, request }) {
  const manifest = assertDomainConnectorAdapter(adapter);
  const input = deepFreeze(structuredClone(request || {}));
  const page = validate(
    changePageSchema,
    await adapter.readChanges(input),
    'Normalized change page'
  );
  assertNoCredentialMaterial(page);
  if (page.hasMore && !page.nextCursor) {
    throw contractError('A paginated change page must provide nextCursor');
  }
  if (!page.hasMore && page.nextCursor) {
    throw contractError('A terminal change page cannot provide nextCursor');
  }
  if (request?.mode === 'RECONCILIATION' && !page.hasMore && !page.snapshotComplete) {
    throw contractError('A terminal reconciliation page must declare snapshotComplete');
  }
  const eventKeys = new Set();
  for (const change of page.changes) {
    if (!manifest.resourceTypes.includes(change.resourceType)) {
      throw contractError(`Connector emitted undeclared resource type ${change.resourceType}`);
    }
    if (eventKeys.has(change.eventKey)) {
      throw contractError('A change page cannot contain duplicate eventKey values');
    }
    eventKeys.add(change.eventKey);
    if (Buffer.byteLength(JSON.stringify(change.projectionPayload), 'utf8') > 65536) {
      throw contractError('Normalized projection payload exceeds 64 KiB');
    }
  }
  return page;
}

async function runDomainConnectorConformance({ adapter, verificationContext = {}, requests }) {
  const manifest = assertDomainConnectorAdapter(adapter);
  if (manifest.adapterKind !== 'CONFORMANCE_FIXTURE') {
    throw contractError('The reusable conformance runner only accepts fixture adapters');
  }
  const verification = await verifyDomainConnector({ adapter, context: verificationContext });
  const scenarios = [];
  for (const request of requests || []) {
    const first = await readDomainConnectorChanges({ adapter, request });
    const replay = await readDomainConnectorChanges({ adapter, request });
    const firstSerialized = stableSerialize(first);
    if (stableSerialize(replay) !== firstSerialized) {
      throw contractError('Connector normalization is not deterministic for identical input');
    }
    scenarios.push({
      key: request.key || null,
      mode: request.mode || null,
      changeCount: first.changes.length,
      eventKeys: first.changes.map(change => change.eventKey),
      digest: crypto.createHash('sha256').update(firstSerialized).digest('hex')
    });
  }
  const report = {
    contractVersion: DOMAIN_CONNECTOR_CONTRACT_VERSION,
    connectorKey: manifest.connectorKey,
    providerKey: manifest.providerKey,
    domain: manifest.domain,
    verification,
    scenarios
  };
  return {
    ...report,
    reportDigest: crypto.createHash('sha256').update(stableSerialize(report)).digest('hex')
  };
}

module.exports = {
  DOMAIN_CONNECTOR_CONTRACT_VERSION,
  defineDomainConnectorManifest,
  assertDomainConnectorAdapter,
  verifyDomainConnector,
  readDomainConnectorChanges,
  runDomainConnectorConformance,
  assertNoCredentialMaterial
};
