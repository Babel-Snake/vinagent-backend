const { ValidationError } = require('../utils/errors');

class IntegrationJobHandlerUnavailableError extends Error {
  constructor(jobKind) {
    super(`No integration job handler is registered for '${jobKind}'.`);
    this.name = 'IntegrationJobHandlerUnavailableError';
    this.code = 'JOB_HANDLER_UNAVAILABLE';
    this.permanent = true;
  }
}

function createIntegrationJobHandlerRegistry() {
  const handlers = new Map();

  const normalizeKind = jobKind => {
    const normalized = String(jobKind || '').trim().toUpperCase();
    if (!normalized || normalized.length > 120 || !/^[A-Z0-9_.-]+$/.test(normalized)) {
      throw new ValidationError('jobKind must be a stable registry key');
    }
    return normalized;
  };

  return {
    register(jobKind, handler, { replace = false } = {}) {
      const normalized = normalizeKind(jobKind);
      if (typeof handler !== 'function') throw new ValidationError('Integration job handler must be a function');
      if (handlers.has(normalized) && !replace) {
        throw new ValidationError(`A handler is already registered for '${normalized}'`);
      }
      handlers.set(normalized, handler);
      return normalized;
    },

    unregister(jobKind) {
      return handlers.delete(normalizeKind(jobKind));
    },

    has(jobKind) {
      return handlers.has(normalizeKind(jobKind));
    },

    list() {
      return [...handlers.keys()].sort();
    },

    async execute(job, context = {}) {
      const normalized = normalizeKind(job?.jobKind);
      const handler = handlers.get(normalized);
      if (!handler) throw new IntegrationJobHandlerUnavailableError(normalized);
      return handler(job, context);
    }
  };
}

const defaultRegistry = createIntegrationJobHandlerRegistry();

module.exports = {
  IntegrationJobHandlerUnavailableError,
  createIntegrationJobHandlerRegistry,
  register: defaultRegistry.register,
  unregister: defaultRegistry.unregister,
  has: defaultRegistry.has,
  list: defaultRegistry.list,
  execute: defaultRegistry.execute
};
