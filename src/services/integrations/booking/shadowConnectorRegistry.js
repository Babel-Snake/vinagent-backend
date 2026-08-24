const { ValidationError } = require('../../../utils/errors');
const {
  PROVIDER_KEY,
  VinAgentBookingFeedProvider,
  normalizeBookingFeedConfiguration
} = require('./providers/vinagentBookingFeed');
const {
  PROVIDER_KEY: OPENTABLE_PROVIDER_KEY,
  OpenTableSyncProvider,
  openTableTranslator,
  normalizeOpenTableConfiguration
} = require('./providers/opentableSync');
const { BOOKING_READ_ADAPTER_CONTRACT_VERSION } = require('./bookingReadAdapter.contract');
const { assertRuntimeNativeBookingTranslator } = require('./nativeBookingAdapter');

const CONNECTOR_ADAPTER_KINDS = Object.freeze(['FEED_GATEWAY', 'NATIVE_PROVIDER']);

function defineShadowBookingConnectorManifest(definition) {
  const allowedKeys = new Set([
    'providerKey', 'domain', 'mode', 'adapterKind', 'supportedSyncModes', 'contractVersion',
    'adapterContractVersion', 'supportedCredentialTypes', 'validateConfiguration', 'createAdapter'
  ]);
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)
    || Object.keys(definition).some(key => !allowedKeys.has(key))) {
    throw new ValidationError('Shadow booking connector manifest contains unsupported fields');
  }
  const providerKey = String(definition.providerKey || '').trim().toLowerCase();
  const adapterKind = String(definition.adapterKind || '').trim().toUpperCase();
  const supportedSyncModes = [...new Set((definition.supportedSyncModes || [])
    .map(mode => String(mode).trim().toUpperCase()))];
  const supportedCredentialTypes = [...new Set((definition.supportedCredentialTypes || [])
    .map(type => String(type).trim().toUpperCase()))];
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(providerKey)
    || definition.domain !== 'BOOKING'
    || definition.mode !== 'READ_ONLY_POLLING'
    || !CONNECTOR_ADAPTER_KINDS.includes(adapterKind)
    || supportedSyncModes.length === 0
    || supportedSyncModes.some(mode => !['HYDRATION', 'INCREMENTAL', 'RECONCILIATION'].includes(mode))
    || definition.contractVersion !== '1'
    || definition.adapterContractVersion !== BOOKING_READ_ADAPTER_CONTRACT_VERSION
    || supportedCredentialTypes.length === 0
    || typeof definition.validateConfiguration !== 'function'
    || typeof definition.createAdapter !== 'function') {
    throw new ValidationError('Shadow booking connector manifest is invalid');
  }
  return Object.freeze({
    ...definition,
    providerKey,
    adapterKind,
    supportedSyncModes: Object.freeze(supportedSyncModes),
    supportedCredentialTypes: Object.freeze(supportedCredentialTypes)
  });
}

const manifests = new Map([
  [PROVIDER_KEY, defineShadowBookingConnectorManifest({
    providerKey: PROVIDER_KEY,
    domain: 'BOOKING',
    mode: 'READ_ONLY_POLLING',
    adapterKind: 'FEED_GATEWAY',
    supportedSyncModes: Object.freeze(['HYDRATION', 'INCREMENTAL', 'RECONCILIATION']),
    contractVersion: '1',
    adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION,
    supportedCredentialTypes: Object.freeze(['BEARER_TOKEN', 'API_KEY']),
    validateConfiguration: normalizeBookingFeedConfiguration,
    createAdapter: options => new VinAgentBookingFeedProvider(options)
  })],
  [OPENTABLE_PROVIDER_KEY, defineShadowBookingConnectorManifest({
    providerKey: OPENTABLE_PROVIDER_KEY,
    domain: 'BOOKING',
    mode: 'READ_ONLY_POLLING',
    adapterKind: 'NATIVE_PROVIDER',
    supportedSyncModes: Object.freeze(['HYDRATION', 'INCREMENTAL', 'RECONCILIATION']),
    contractVersion: '1',
    adapterContractVersion: assertRuntimeNativeBookingTranslator(openTableTranslator).adapterContractVersion,
    supportedCredentialTypes: Object.freeze(['OAUTH_CLIENT_CREDENTIALS']),
    validateConfiguration: normalizeOpenTableConfiguration,
    createAdapter: options => new OpenTableSyncProvider(options)
  })]
]);

function getShadowBookingConnectorManifest(providerKey) {
  const key = String(providerKey || '').trim().toLowerCase();
  const manifest = manifests.get(key);
  if (!manifest) throw new ValidationError('No read-only shadow booking connector is registered for this provider');
  return manifest;
}

function hasShadowBookingConnector(providerKey) {
  return manifests.has(String(providerKey || '').trim().toLowerCase());
}

function listShadowBookingConnectorManifests() {
  return [...manifests.values()].map(manifest => ({
    providerKey: manifest.providerKey,
    domain: manifest.domain,
    mode: manifest.mode,
    adapterKind: manifest.adapterKind,
    supportedSyncModes: [...manifest.supportedSyncModes],
    contractVersion: manifest.contractVersion,
    adapterContractVersion: manifest.adapterContractVersion,
    supportedCredentialTypes: [...manifest.supportedCredentialTypes]
  }));
}

module.exports = {
  CONNECTOR_ADAPTER_KINDS,
  defineShadowBookingConnectorManifest,
  getShadowBookingConnectorManifest,
  hasShadowBookingConnector,
  listShadowBookingConnectorManifests
};
