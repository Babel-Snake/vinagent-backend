const { ValidationError, NotFoundError } = require('../../utils/errors');
const {
  assertDomainConnectorAdapter
} = require('./domainConnector.contract');

function createDomainConnectorRegistry() {
  const adapters = new Map();
  return Object.freeze({
    register(adapter) {
      const manifest = assertDomainConnectorAdapter(adapter);
      if (manifest.adapterKind === 'CONFORMANCE_FIXTURE') {
        throw new ValidationError('Fixture domain connectors cannot be registered at runtime');
      }
      if (adapters.has(manifest.connectorKey)) {
        throw new ValidationError(`Domain connector ${manifest.connectorKey} is already registered`);
      }
      adapters.set(manifest.connectorKey, adapter);
      return adapter;
    },
    get(connectorKey) {
      const adapter = adapters.get(String(connectorKey || '').trim().toLowerCase());
      if (!adapter) throw new NotFoundError('Domain connector is not registered');
      return adapter;
    },
    has(connectorKey) {
      return adapters.has(String(connectorKey || '').trim().toLowerCase());
    },
    list() {
      return [...adapters.values()]
        .map(adapter => adapter.manifest)
        .sort((left, right) => left.connectorKey.localeCompare(right.connectorKey));
    }
  });
}

module.exports = { createDomainConnectorRegistry };
