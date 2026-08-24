const { IntegrationConnection, IntegrationEvent } = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');
const webhookRecoveries = require('./integrationWebhookRecoveries.service');

async function dispatchProviderWebhookRecovery(job, {
  workerId,
  env = process.env,
  recoveryRegistry = webhookRecoveries,
  now = new Date()
} = {}) {
  const domain = String(job.payload?.domain || '').trim().toUpperCase();
  if (Number(job.payload?.eventId) !== Number(job.sourceEventId)) {
    const error = new ValidationError('Provider webhook dispatch event identity is invalid');
    error.permanent = true;
    throw error;
  }
  const [event, connection] = await Promise.all([
    IntegrationEvent.findOne({ where: { id: job.sourceEventId, wineryId: job.wineryId, connectionId: job.connectionId } }),
    IntegrationConnection.findOne({ where: { id: job.connectionId, wineryId: job.wineryId } })
  ]);
  if (!event || !connection) {
    const error = new NotFoundError('Provider webhook dispatch source was not found');
    error.permanent = true;
    throw error;
  }
  if (event.intakeMethod !== 'provider_webhook' || event.eventClass !== 'INTAKE'
    || event.metadata?.domain !== domain) {
    const error = new ValidationError('Provider webhook dispatch source is invalid');
    error.permanent = true;
    throw error;
  }
  return recoveryRegistry.dispatch(domain, { event, connection, workerId, env, now });
}

module.exports = { dispatchProviderWebhookRecovery };
