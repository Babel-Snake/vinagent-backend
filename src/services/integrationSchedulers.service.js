const { createIntegrationSchedulerRegistry } = require('./integrationSchedulerRegistry.service');
const bookingSyncSchedulerService = require('./bookingSyncScheduler.service');
const { getBookingSyncSchedulerConfig } = require('./bookingSyncSchedulerConfig.service');

function createConfiguredIntegrationSchedulerRegistry({ bookingScheduler = bookingSyncSchedulerService } = {}) {
  const registry = createIntegrationSchedulerRegistry();
  registry.register({
    domain: 'BOOKING',
    configKey: 'bookingScheduler',
    getConfig: getBookingSyncSchedulerConfig,
    schedule: options => bookingScheduler.scheduleDueBookingSyncs(options),
    getStatus: options => bookingScheduler.getBookingSyncSchedulerStatus(options)
  });
  return registry;
}

const defaultRegistry = createConfiguredIntegrationSchedulerRegistry();

module.exports = {
  createConfiguredIntegrationSchedulerRegistry,
  register: defaultRegistry.register,
  unregister: defaultRegistry.unregister,
  list: defaultRegistry.list,
  getConfigs: defaultRegistry.getConfigs,
  scheduleDue: defaultRegistry.scheduleDue,
  getStatuses: defaultRegistry.getStatuses
};
