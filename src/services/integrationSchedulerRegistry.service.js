const { ValidationError } = require('../utils/errors');
const {
  INTEGRATION_DOMAINS,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const normalizeDomain = value => {
  const domain = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(INTEGRATION_DOMAINS, domain)) {
    throw new ValidationError('Scheduler domain is not supported');
  }
  return domain;
};

const normalizeConfigKey = value => {
  const key = String(value || '').trim();
  if (!/^[a-z][A-Za-z0-9]{0,79}$/.test(key)) {
    throw new ValidationError('Scheduler configKey must be a stable JavaScript property key');
  }
  return key;
};

const finiteCount = value => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

function createIntegrationSchedulerRegistry() {
  const registrations = new Map();

  const orderedEntries = () => [...registrations.values()]
    .sort((left, right) => left.domain.localeCompare(right.domain));

  return {
    register({ domain, configKey, getConfig, schedule, getStatus }) {
      const normalizedDomain = normalizeDomain(domain);
      const normalizedConfigKey = normalizeConfigKey(configKey);
      if (registrations.has(normalizedDomain)) {
        throw new ValidationError(`A scheduler is already registered for '${normalizedDomain}'`);
      }
      if (typeof getConfig !== 'function') throw new ValidationError('Scheduler getConfig must be a function');
      if (typeof schedule !== 'function') throw new ValidationError('Scheduler schedule must be a function');
      if (getStatus != null && typeof getStatus !== 'function') {
        throw new ValidationError('Scheduler getStatus must be a function');
      }
      registrations.set(normalizedDomain, {
        domain: normalizedDomain,
        configKey: normalizedConfigKey,
        getConfig,
        schedule,
        getStatus: getStatus || null
      });
      return normalizedDomain;
    },

    unregister(domain) {
      return registrations.delete(normalizeDomain(domain));
    },

    list() {
      return orderedEntries().map(({ domain, configKey }) => ({ domain, configKey }));
    },

    getConfigs(env = process.env) {
      return Object.fromEntries(orderedEntries().map(entry => [
        entry.configKey,
        entry.getConfig(env)
      ]));
    },

    async scheduleDue({ workerId, configs = {}, jobService }) {
      const domains = [];
      for (const entry of orderedEntries()) {
        const config = configs[entry.configKey] || {};
        try {
          const result = await entry.schedule({ workerId, config, jobService });
          domains.push({
            ...(result || {}),
            domain: entry.domain,
            schedulerStatus: result?.enabled === false ? 'DISABLED' : 'SUCCEEDED'
          });
        } catch (error) {
          domains.push({
            domain: entry.domain,
            schedulerStatus: 'FAILED',
            enabled: Boolean(config.enabled),
            examined: 0,
            scheduled: 0,
            duplicates: 0,
            failed: 1,
            errorCode: String(error.code || 'DOMAIN_SCHEDULER_FAILED').slice(0, 120),
            results: []
          });
        }
      }
      return {
        examined: domains.reduce((sum, item) => sum + finiteCount(item.examined), 0),
        scheduled: domains.reduce((sum, item) => sum + finiteCount(item.scheduled), 0),
        duplicates: domains.reduce((sum, item) => sum + finiteCount(item.duplicates), 0),
        failed: domains.reduce((sum, item) => sum + finiteCount(item.failed), 0),
        schedulerFailures: domains.filter(item => item.schedulerStatus === 'FAILED').length,
        domains
      };
    },

    async getStatuses({ wineryId, configs = {}, now = new Date() }) {
      const domains = [];
      for (const entry of orderedEntries()) {
        const config = configs[entry.configKey] || {};
        if (!entry.getStatus) {
          domains.push({
            domain: entry.domain,
            schedulerStatus: 'UNAVAILABLE',
            enabled: Boolean(config.enabled),
            errorCode: 'SCHEDULER_STATUS_NOT_REGISTERED'
          });
          continue;
        }
        try {
          domains.push({
            ...(await entry.getStatus({ wineryId, config, now })),
            domain: entry.domain,
            schedulerStatus: 'AVAILABLE'
          });
        } catch (error) {
          domains.push({
            domain: entry.domain,
            schedulerStatus: 'UNAVAILABLE',
            enabled: Boolean(config.enabled),
            errorCode: String(error.code || 'SCHEDULER_STATUS_FAILED').slice(0, 120)
          });
        }
      }
      return {
        registeredDomains: domains.length,
        enabledDomains: domains.filter(item => item.enabled).length,
        unavailableDomains: domains.filter(item => item.schedulerStatus === 'UNAVAILABLE').length,
        domains
      };
    }
  };
}

module.exports = {
  createIntegrationSchedulerRegistry
};
