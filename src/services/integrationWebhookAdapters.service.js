const { ValidationError } = require('../utils/errors');
const {
  createVinAgentHmacChangeHintAdapter
} = require('./integrationWebhookAdapter.contract');

function createIntegrationWebhookAdapterRegistry() {
  const adapters = new Map();
  return {
    register(adapter, { replace = false } = {}) {
      if (!adapter?.adapterKey || typeof adapter.verifyAndNormalize !== 'function') {
        throw new ValidationError('A valid integration webhook adapter is required');
      }
      if (adapters.has(adapter.adapterKey) && !replace) {
        throw new ValidationError(`A webhook adapter is already registered for '${adapter.adapterKey}'`);
      }
      adapters.set(adapter.adapterKey, adapter);
      return adapter.adapterKey;
    },
    get(adapterKey, domain) {
      const key = String(adapterKey || '').trim().toLowerCase();
      const adapter = adapters.get(key);
      const normalizedDomain = String(domain || '').trim().toUpperCase();
      if (!adapter || (!adapter.supportedDomains.includes('*')
        && !adapter.supportedDomains.includes(normalizedDomain))) {
        throw new ValidationError('No compatible integration webhook adapter is registered');
      }
      return adapter;
    },
    has(adapterKey, domain) {
      const key = String(adapterKey || '').trim().toLowerCase();
      const adapter = adapters.get(key);
      const normalizedDomain = String(domain || '').trim().toUpperCase();
      return Boolean(adapter && (adapter.supportedDomains.includes('*')
        || adapter.supportedDomains.includes(normalizedDomain)));
    },
    list() {
      return [...adapters.values()]
        .sort((left, right) => left.adapterKey.localeCompare(right.adapterKey))
        .map(adapter => ({
          adapterKey: adapter.adapterKey,
          adapterVersion: adapter.adapterVersion,
          contractVersion: adapter.contractVersion,
          supportedDomains: [...adapter.supportedDomains],
          verificationScheme: adapter.verificationScheme
        }));
    }
  };
}

function createConfiguredIntegrationWebhookAdapterRegistry() {
  const registry = createIntegrationWebhookAdapterRegistry();
  registry.register(createVinAgentHmacChangeHintAdapter());
  return registry;
}

const configuredRegistry = createConfiguredIntegrationWebhookAdapterRegistry();

module.exports = {
  createIntegrationWebhookAdapterRegistry,
  createConfiguredIntegrationWebhookAdapterRegistry,
  get: configuredRegistry.get,
  has: configuredRegistry.has,
  list: configuredRegistry.list
};
