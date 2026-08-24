const { createIntegrationJobHandlerRegistry } = require('./integrationJobHandlerRegistry.service');
const {
  BOOKING_VERIFY_JOB_KIND,
  BOOKING_HYDRATE_JOB_KIND,
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  executeBookingConnectionVerification,
  executeBookingHydration,
  executeBookingIncremental,
  executeBookingReconciliation
} = require('./bookingShadowSync.service');
const { PROVIDER_WEBHOOK_DISPATCH_JOB_KIND } = require('./integrationWebhookIntake.service');
const { dispatchProviderWebhookRecovery } = require('./integrationWebhookDispatch.service');

const REGISTERED_JOB_KINDS = Object.freeze([
  BOOKING_HYDRATE_JOB_KIND,
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  BOOKING_VERIFY_JOB_KIND,
  PROVIDER_WEBHOOK_DISPATCH_JOB_KIND
].sort());

function markDeterministicValidationPermanent(error) {
  if (error?.statusCode === 400 || error?.code === 'BOOKING_FEED_SCHEMA_INVALID') {
    error.permanent = true;
  }
  throw error;
}

function createConfiguredIntegrationJobHandlerRegistry({ env = process.env, httpClient } = {}) {
  const registry = createIntegrationJobHandlerRegistry();
  registry.register(BOOKING_VERIFY_JOB_KIND, async (job, context) => {
    try {
      return await executeBookingConnectionVerification(job, { ...context, env, httpClient });
    } catch (error) {
      return markDeterministicValidationPermanent(error);
    }
  });
  registry.register(BOOKING_HYDRATE_JOB_KIND, async (job, context) => {
    try {
      return await executeBookingHydration(job, { ...context, env, httpClient });
    } catch (error) {
      return markDeterministicValidationPermanent(error);
    }
  });
  registry.register(BOOKING_INCREMENTAL_JOB_KIND, async (job, context) => {
    try {
      return await executeBookingIncremental(job, { ...context, env, httpClient });
    } catch (error) {
      return markDeterministicValidationPermanent(error);
    }
  });
  registry.register(BOOKING_RECONCILE_JOB_KIND, async (job, context) => {
    try {
      return await executeBookingReconciliation(job, { ...context, env, httpClient });
    } catch (error) {
      return markDeterministicValidationPermanent(error);
    }
  });
  registry.register(PROVIDER_WEBHOOK_DISPATCH_JOB_KIND, (job, context) => (
    dispatchProviderWebhookRecovery(job, { ...context, env })
  ));
  return registry;
}

function listConfiguredIntegrationJobKinds() {
  return [...REGISTERED_JOB_KINDS];
}

module.exports = {
  createConfiguredIntegrationJobHandlerRegistry,
  listConfiguredIntegrationJobKinds
};
