const crypto = require('crypto');
const { WineryIntegrationConfig, WinerySettings } = require('../models');
const { ValidationError } = require('../utils/errors');

const DOMAINS = ['sms', 'email', 'pos', 'crm', 'booking', 'delivery'];

const PROVIDER_FIELDS = {
  sms: 'smsProvider',
  email: 'emailProvider',
  pos: 'posProvider',
  crm: 'crmProvider',
  booking: 'bookingProvider',
  delivery: 'deliveryProvider'
};

const DEFAULT_PROVIDERS = {
  sms: 'twilio',
  email: 'sendgrid',
  pos: 'other',
  crm: 'other',
  booking: 'other',
  delivery: 'other'
};

const DEFAULT_AUTH_METHODS = {
  sms: 'api_key',
  email: 'api_key',
  pos: 'api_key',
  crm: 'api_key',
  booking: 'api_key',
  delivery: 'api_key'
};

const DEFAULT_CAPABILITIES = {
  sms: ['send_outbound', 'receive_webhook', 'log_message'],
  email: ['send_outbound', 'read_inbox', 'receive_webhook', 'log_message'],
  pos: ['read_orders', 'read_products'],
  crm: ['read_customers', 'write_customer_notes', 'record_order_event', 'sync_external_ids'],
  booking: ['check_availability', 'create_reservation', 'record_booking_reference'],
  delivery: ['track_shipments', 'create_tracking_follow_up']
};

const WEBHOOK_PATHS = {
  sms: '/api/webhooks/sms',
  email: '/api/webhooks/email',
  booking: '/api/webhooks/integration/{wineryId}/booking',
  crm: '/api/webhooks/integration/{wineryId}/crm',
  pos: '/api/webhooks/integration/{wineryId}/pos',
  delivery: '/api/webhooks/integration/{wineryId}/delivery'
};

const WEBHOOK_SECRET_MIN_LENGTH = 16;

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function digestWebhookSecret(secret) {
  return crypto
    .createHash('sha256')
    .update(String(secret || '').trim(), 'utf8')
    .digest('hex');
}

function hashWebhookSecret(secret) {
  const normalized = String(secret || '').trim();
  if (!normalized) return null;
  if (normalized.length < WEBHOOK_SECRET_MIN_LENGTH) {
    throw new ValidationError(`Webhook signing secrets must be at least ${WEBHOOK_SECRET_MIN_LENGTH} characters.`);
  }
  return digestWebhookSecret(normalized);
}

function sanitizeProviderConnection(connection = {}) {
  const parsed = parseJsonObject(connection);
  const webhookSigningConfigured = Boolean(parsed.webhookSecretHash || parsed.webhookSigningConfigured);
  const safeConnection = { ...parsed };
  delete safeConnection.webhookSecret;
  delete safeConnection.webhookSecretHash;
  delete safeConnection.clearWebhookSecret;

  return {
    ...safeConnection,
    webhookSigningConfigured
  };
}

function sanitizeProviderConnections(providerConnections) {
  const connections = parseJsonObject(providerConnections);
  return Object.keys(connections).reduce((safe, domain) => {
    safe[domain] = sanitizeProviderConnection(connections[domain]);
    return safe;
  }, {});
}

function serializeIntegrationConfig(config) {
  if (!config) return null;
  const plain = config.toJSON ? config.toJSON() : { ...config };
  return {
    ...plain,
    providerConnections: sanitizeProviderConnections(plain.providerConnections)
  };
}

function mapCrmProviderToExecution(provider) {
  if (provider === 'commerce7' || provider === 'winedirect') return provider;
  return 'mock';
}

function mapBookingProviderToExecution(provider) {
  if (provider === 'sevenrooms') return 'sevenrooms';
  return 'mock';
}

function getExecutionProvider(domain, provider) {
  if (domain === 'crm') return mapCrmProviderToExecution(provider);
  if (domain === 'booking') return mapBookingProviderToExecution(provider);
  return provider;
}

function hasLiveAdapter(domain, provider) {
  if (domain === 'sms') return provider === 'twilio';
  if (domain === 'email') return provider === 'sendgrid' || provider === 'outlook';
  return false;
}

function normalizeProviderConnections(payload = {}, existingConfig = null) {
  const incomingConnections = parseJsonObject(payload.providerConnections);
  const existingConnections = parseJsonObject(existingConfig?.providerConnections);
  const now = new Date().toISOString();

  return DOMAINS.reduce((connections, domain) => {
    const providerField = PROVIDER_FIELDS[domain];
    const provider = payload[providerField] || existingConfig?.[providerField] || DEFAULT_PROVIDERS[domain];
    const incoming = parseJsonObject(incomingConnections[domain]);
    const existing = parseJsonObject(existingConnections[domain]);
    const executionProvider = getExecutionProvider(domain, provider);
    const incomingSecret = typeof incoming.webhookSecret === 'string' ? incoming.webhookSecret.trim() : '';
    const webhookSecretHash = incoming.clearWebhookSecret
      ? null
      : (incomingSecret ? hashWebhookSecret(incomingSecret) : existing.webhookSecretHash || null);
    const webhookSecretLastRotatedAt = incoming.clearWebhookSecret
      ? null
      : (incomingSecret ? now : existing.webhookSecretLastRotatedAt || null);

    connections[domain] = {
      provider,
      executionProvider,
      liveAdapterAvailable: hasLiveAdapter(domain, provider),
      status: incoming.status || existing.status || 'not_connected',
      authMethod: incoming.authMethod || existing.authMethod || DEFAULT_AUTH_METHODS[domain],
      externalAccountId: incoming.externalAccountId ?? existing.externalAccountId ?? '',
      externalLocationId: incoming.externalLocationId ?? existing.externalLocationId ?? '',
      baseUrl: incoming.baseUrl ?? existing.baseUrl ?? '',
      webhookUrl: incoming.webhookUrl ?? existing.webhookUrl ?? WEBHOOK_PATHS[domain],
      webhookSigningConfigured: Boolean(webhookSecretHash),
      webhookSecretHash,
      webhookSecretLastRotatedAt,
      capabilities: Array.isArray(incoming.capabilities)
        ? incoming.capabilities
        : (Array.isArray(existing.capabilities) ? existing.capabilities : DEFAULT_CAPABILITIES[domain]),
      lastTestedAt: incoming.lastTestedAt ?? existing.lastTestedAt ?? null,
      lastError: incoming.lastError ?? existing.lastError ?? null,
      notes: incoming.notes ?? existing.notes ?? ''
    };

    return connections;
  }, {});
}

function buildProviderConfig(connection, selectedProvider) {
  return {
    selectedProvider,
    authMethod: connection.authMethod || 'api_key',
    externalAccountId: connection.externalAccountId || null,
    externalLocationId: connection.externalLocationId || null,
    baseUrl: connection.baseUrl || null,
    webhookUrl: connection.webhookUrl || null,
    capabilities: Array.isArray(connection.capabilities) ? connection.capabilities : []
  };
}

async function syncExecutionSettings({ wineryId, integrationConfig, transaction = null }) {
  const connections = parseJsonObject(integrationConfig.providerConnections);
  const [settings] = await WinerySettings.findOrCreate({
    where: { wineryId },
    transaction
  });

  const crmConnection = connections.crm || {};
  const bookingConnection = connections.booking || {};
  const crmProvider = integrationConfig.crmProvider || 'other';
  const bookingProvider = integrationConfig.bookingProvider || 'other';

  await settings.update({
    crmProvider: mapCrmProviderToExecution(crmProvider),
    crmConfig: buildProviderConfig(crmConnection, crmProvider),
    bookingProvider: mapBookingProviderToExecution(bookingProvider),
    bookingConfig: buildProviderConfig(bookingConnection, bookingProvider)
  }, { transaction });

  return settings;
}

function assessConnection(config, domain) {
  const connections = parseJsonObject(config.providerConnections);
  const connection = parseJsonObject(connections[domain]);
  const providerField = PROVIDER_FIELDS[domain];
  const provider = connection.provider || config[providerField] || DEFAULT_PROVIDERS[domain];
  const executionProvider = getExecutionProvider(domain, provider);
  const now = new Date().toISOString();

  let status = 'not_connected';
  let lastError = null;
  let summary = 'Connection metadata saved. No live adapter is configured for this provider yet.';

  if (domain === 'sms') {
    const hasTwilioCredentials = Boolean(
      process.env.TWILIO_ACCOUNT_SID
      && process.env.TWILIO_AUTH_TOKEN
      && (process.env.TWILIO_PHONE_NUMBER || config.smsFromNumber)
    );
    status = provider === 'twilio' && hasTwilioCredentials ? 'connected' : 'error';
    lastError = status === 'connected' ? null : 'Twilio credentials or sender number are missing.';
    summary = status === 'connected'
      ? 'Twilio credentials are present for outbound SMS.'
      : 'Twilio is selected, but required credentials are missing.';
  } else if (domain === 'email') {
    if (provider === 'outlook') {
      const hasOutlookCredentials = Boolean(
        process.env.OUTLOOK_GRAPH_TENANT_ID
        && process.env.OUTLOOK_GRAPH_CLIENT_ID
        && process.env.OUTLOOK_GRAPH_CLIENT_SECRET
        && (connection.externalAccountId || config.emailFromAddress)
      );
      status = hasOutlookCredentials ? 'connected' : 'error';
      lastError = status === 'connected' ? null : 'Microsoft Graph credentials or mailbox address are missing.';
      summary = status === 'connected'
        ? 'Microsoft Graph credentials and mailbox address are present for Outlook mail sync/send.'
        : 'Outlook is selected, but required Microsoft Graph credentials or mailbox address are missing.';
    } else {
      const hasSendgridCredentials = Boolean(process.env.SENDGRID_API_KEY && config.emailFromAddress);
      status = provider === 'sendgrid' && hasSendgridCredentials ? 'connected' : 'error';
      lastError = status === 'connected' ? null : 'SendGrid API key or from email address is missing.';
      summary = status === 'connected'
        ? 'SendGrid credentials are present for outbound email.'
        : 'SendGrid is selected, but required credentials are missing.';
    }
  } else if (provider === 'other') {
    status = 'not_connected';
    summary = 'No provider selected yet.';
  } else if (domain === 'crm' || domain === 'booking') {
    status = 'error';
    lastError = `${provider} is selected, but a live ${domain} adapter is not implemented yet. Execution provider is currently ${executionProvider}.`;
    summary = lastError;
  } else {
    status = 'error';
    lastError = `${provider} is selected, but ${domain} access is not implemented yet.`;
    summary = lastError;
  }

  return {
    ...connection,
    provider,
    executionProvider,
    liveAdapterAvailable: hasLiveAdapter(domain, provider),
    status,
    lastTestedAt: now,
    lastError,
    summary,
    capabilities: Array.isArray(connection.capabilities) ? connection.capabilities : DEFAULT_CAPABILITIES[domain]
  };
}

async function testConnection({ wineryId, domain }) {
  const config = await WineryIntegrationConfig.findOne({ where: { wineryId } });
  if (!config) {
    const err = new Error('Integration config not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const testedConnection = assessConnection(config, domain);
  const connections = {
    ...parseJsonObject(config.providerConnections),
    [domain]: testedConnection
  };

  await config.update({ providerConnections: connections });
  return testedConnection;
}

module.exports = {
  DOMAINS,
  DEFAULT_CAPABILITIES,
  digestWebhookSecret,
  hashWebhookSecret,
  normalizeProviderConnections,
  parseJsonObject,
  sanitizeProviderConnection,
  sanitizeProviderConnections,
  serializeIntegrationConfig,
  syncExecutionSettings,
  testConnection,
  mapCrmProviderToExecution,
  mapBookingProviderToExecution
};
