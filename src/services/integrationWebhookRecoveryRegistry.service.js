const { ValidationError } = require('../utils/errors');
const { INTEGRATION_DOMAINS } = require('./integrationDataRegistry.service');

class IntegrationWebhookRecoveryUnavailableError extends Error {
  constructor(domain) {
    super(`No provider webhook recovery handler is registered for '${domain}'.`);
    this.name = 'IntegrationWebhookRecoveryUnavailableError';
    this.code = 'PROVIDER_WEBHOOK_RECOVERY_UNAVAILABLE';
    this.permanent = true;
  }
}

function normalizeDomain(domain) {
  const normalized = String(domain || '').trim().toUpperCase();
  if (!INTEGRATION_DOMAINS.includes(normalized)) {
    throw new ValidationError('Provider webhook recovery domain is invalid');
  }
  return normalized;
}

function createIntegrationWebhookRecoveryRegistry() {
  const handlers = new Map();
  return {
    register(domain, handler, { replace = false } = {}) {
      const normalized = normalizeDomain(domain);
      if (typeof handler !== 'function') throw new ValidationError('Provider webhook recovery handler must be a function');
      if (handlers.has(normalized) && !replace) {
        throw new ValidationError(`A provider webhook recovery handler is already registered for '${normalized}'`);
      }
      handlers.set(normalized, handler);
      return normalized;
    },
    has(domain) {
      return handlers.has(normalizeDomain(domain));
    },
    list() {
      return [...handlers.keys()].sort();
    },
    async dispatch(domain, context) {
      const normalized = normalizeDomain(domain);
      const handler = handlers.get(normalized);
      if (!handler) throw new IntegrationWebhookRecoveryUnavailableError(normalized);
      return handler(context);
    }
  };
}

module.exports = {
  IntegrationWebhookRecoveryUnavailableError,
  createIntegrationWebhookRecoveryRegistry
};
