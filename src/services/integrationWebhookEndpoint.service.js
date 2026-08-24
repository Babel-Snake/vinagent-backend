const crypto = require('crypto');
const {
  IntegrationConnection,
  IntegrationConnectionScope,
  IntegrationWebhookEndpoint,
  User,
  sequelize
} = require('../models');
const AppError = require('../utils/AppError');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { INTEGRATION_DOMAINS } = require('./integrationDataRegistry.service');
const credentialService = require('./integrationCredential.service');
const webhookAdapters = require('./integrationWebhookAdapters.service');
const webhookRecoveries = require('./integrationWebhookRecoveries.service');

const WEBHOOK_ENDPOINT_STATUSES = Object.freeze(['ACTIVE', 'DISABLED', 'REVOKED']);
const MAX_VERIFICATION_MATERIAL_BYTES = 16384;

function endpointAad({ endpointKey, wineryId, connectionId, verificationSchemaVersion = '1' }) {
  return Buffer.from(
    `vinagent.integration-webhook-endpoint|${endpointKey}|${wineryId}|${connectionId}|${verificationSchemaVersion}`,
    'utf8'
  );
}

function normalizeConfiguration(configuration = {}) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new ValidationError('Webhook endpoint configuration must be an object');
  }
  const allowed = new Set(['maxAgeSeconds']);
  if (Object.keys(configuration).some(key => !allowed.has(key))) {
    throw new ValidationError('Webhook endpoint configuration contains unsupported fields');
  }
  const maxAgeSeconds = Number(configuration.maxAgeSeconds ?? 300);
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 30 || maxAgeSeconds > 3600) {
    throw new ValidationError('Webhook endpoint maxAgeSeconds must be between 30 and 3600');
  }
  return { maxAgeSeconds };
}

function encryptVerificationMaterial({ endpointKey, wineryId, connectionId, material, env = process.env }) {
  if (!material || typeof material !== 'object' || Array.isArray(material)) {
    throw new ValidationError('Webhook verification material must be an object');
  }
  const serialized = JSON.stringify(material);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_VERIFICATION_MATERIAL_BYTES) {
    throw new ValidationError('Webhook verification material is too large');
  }
  const { activeKeyId, keys } = credentialService.loadCredentialKeyring(env);
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(activeKeyId), initializationVector);
  cipher.setAAD(endpointAad({ endpointKey, wineryId, connectionId }));
  const plaintext = Buffer.from(serialized, 'utf8');
  try {
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      encryptedVerificationMaterial: encrypted.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      keyId: activeKeyId
    };
  } finally {
    plaintext.fill(0);
  }
}

function decryptVerificationMaterial(endpoint, { env = process.env } = {}) {
  if (!endpoint || endpoint.status !== 'ACTIVE' || !endpoint.encryptedVerificationMaterial
    || !endpoint.initializationVector || !endpoint.authenticationTag) {
    throw new AppError(
      'Provider webhook verification material is unavailable.',
      503,
      'PROVIDER_WEBHOOK_VERIFICATION_UNAVAILABLE'
    );
  }
  const { keys } = credentialService.loadCredentialKeyring(env);
  const key = keys.get(endpoint.keyId);
  if (!key) {
    throw new AppError(
      'Provider webhook verification material is unavailable.',
      503,
      'PROVIDER_WEBHOOK_VERIFICATION_UNAVAILABLE'
    );
  }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(endpoint.initializationVector, 'base64')
    );
    decipher.setAAD(endpointAad(endpoint));
    decipher.setAuthTag(Buffer.from(endpoint.authenticationTag, 'base64'));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(endpoint.encryptedVerificationMaterial, 'base64')),
      decipher.final()
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid material');
    return parsed;
  } catch {
    throw new AppError(
      'Provider webhook verification material is unavailable.',
      503,
      'PROVIDER_WEBHOOK_VERIFICATION_UNAVAILABLE'
    );
  } finally {
    if (plaintext) plaintext.fill(0);
  }
}

function serializeWebhookEndpoint(endpoint) {
  const plain = endpoint.toJSON ? endpoint.toJSON() : endpoint;
  return {
    id: plain.id,
    endpointKey: plain.endpointKey,
    connectionId: plain.connectionId,
    domain: plain.domain,
    adapterKey: plain.adapterKey,
    adapterVersion: plain.adapterVersion,
    status: plain.status,
    configuration: plain.configuration,
    rotatedAt: plain.rotatedAt,
    disabledAt: plain.disabledAt,
    revokedAt: plain.revokedAt,
    lastReceivedAt: plain.lastReceivedAt,
    lastVerifiedAt: plain.lastVerifiedAt,
    lastErrorCode: plain.lastErrorCode,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    path: `/api/webhooks/providers/${plain.endpointKey}`
  };
}

async function requireActor({ wineryId, actorUserId, transaction }) {
  const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction });
  if (!actor) throw new ValidationError('Webhook endpoint actor does not belong to the winery');
}

async function requireScopedConnection({ wineryId, connectionId, domain, transaction, lock = false }) {
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    include: [{
      model: IntegrationConnectionScope,
      as: 'Scopes',
      where: { domain, isActive: true },
      required: true,
      attributes: ['id']
    }],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!connection) throw new NotFoundError('Scoped integration connection not found');
  if (connection.status === 'DISABLED') throw new ValidationError('Disabled connections cannot expose webhooks');
  return connection;
}

async function listWebhookEndpoints({ wineryId, connectionId }) {
  const connection = await IntegrationConnection.findOne({ where: { id: connectionId, wineryId }, attributes: ['id'] });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const endpoints = await IntegrationWebhookEndpoint.findAll({
    where: { wineryId, connectionId },
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });
  return endpoints.map(serializeWebhookEndpoint);
}

async function createWebhookEndpoint({
  wineryId,
  connectionId,
  actorUserId,
  data,
  env = process.env,
  adapterRegistry = webhookAdapters,
  recoveryRegistry = webhookRecoveries
}) {
  const domain = String(data.domain || '').trim().toUpperCase();
  if (!INTEGRATION_DOMAINS.includes(domain)) throw new ValidationError('Webhook endpoint domain is invalid');
  if (!recoveryRegistry.has(domain)) {
    throw new ValidationError('No provider webhook recovery handler is registered for this domain');
  }
  const adapter = adapterRegistry.get(data.adapterKey, domain);
  const configuration = normalizeConfiguration(data.configuration);
  const endpointKey = crypto.randomUUID();
  const generated = adapter.createVerificationMaterial({ domain, configuration });
  const encrypted = encryptVerificationMaterial({
    endpointKey,
    wineryId,
    connectionId,
    material: generated.stored,
    env
  });
  const endpoint = await sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    await requireScopedConnection({ wineryId, connectionId, domain, transaction, lock: true });
    const existing = await IntegrationWebhookEndpoint.findOne({
      where: { wineryId, connectionId, domain, adapterKey: adapter.adapterKey, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) throw new ValidationError('An active webhook endpoint already exists for this adapter and domain');
    return IntegrationWebhookEndpoint.create({
      endpointKey,
      wineryId,
      connectionId,
      domain,
      adapterKey: adapter.adapterKey,
      adapterVersion: adapter.adapterVersion,
      status: 'ACTIVE',
      verificationSchemaVersion: '1',
      ...encrypted,
      configuration,
      rotatedAt: new Date(),
      createdBy: actorUserId,
      updatedBy: actorUserId
    }, { transaction });
  });
  return { endpoint: serializeWebhookEndpoint(endpoint), disclosure: generated.disclosure };
}

async function rotateWebhookEndpoint({
  wineryId,
  connectionId,
  endpointId,
  actorUserId,
  env = process.env,
  adapterRegistry = webhookAdapters
}) {
  return sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const endpoint = await IntegrationWebhookEndpoint.findOne({
      where: { id: endpointId, wineryId, connectionId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!endpoint) throw new NotFoundError('Integration webhook endpoint not found');
    if (endpoint.status === 'REVOKED') throw new ValidationError('Revoked webhook endpoints cannot be rotated');
    await requireScopedConnection({ wineryId, connectionId, domain: endpoint.domain, transaction });
    const adapter = adapterRegistry.get(endpoint.adapterKey, endpoint.domain);
    const generated = adapter.createVerificationMaterial({
      domain: endpoint.domain,
      configuration: endpoint.configuration || {}
    });
    const encrypted = encryptVerificationMaterial({
      endpointKey: endpoint.endpointKey,
      wineryId,
      connectionId,
      material: generated.stored,
      env
    });
    await endpoint.update({
      adapterVersion: adapter.adapterVersion,
      ...encrypted,
      rotatedAt: new Date(),
      lastErrorCode: null,
      updatedBy: actorUserId
    }, { transaction });
    return { endpoint: serializeWebhookEndpoint(endpoint), disclosure: generated.disclosure };
  });
}

async function updateWebhookEndpointLifecycle({ wineryId, connectionId, endpointId, actorUserId, action }) {
  const normalizedAction = String(action || '').trim().toUpperCase();
  if (!['DISABLE', 'ENABLE', 'REVOKE'].includes(normalizedAction)) {
    throw new ValidationError('Webhook endpoint lifecycle action is invalid');
  }
  return sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const endpoint = await IntegrationWebhookEndpoint.findOne({
      where: { id: endpointId, wineryId, connectionId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!endpoint) throw new NotFoundError('Integration webhook endpoint not found');
    if (endpoint.status === 'REVOKED') {
      if (normalizedAction === 'REVOKE') return serializeWebhookEndpoint(endpoint);
      throw new ValidationError('Revoked webhook endpoints cannot be re-enabled');
    }
    const now = new Date();
    if (normalizedAction === 'ENABLE') {
      await requireScopedConnection({ wineryId, connectionId, domain: endpoint.domain, transaction });
      const existing = await IntegrationWebhookEndpoint.findOne({
        where: {
          wineryId,
          connectionId,
          domain: endpoint.domain,
          adapterKey: endpoint.adapterKey,
          status: 'ACTIVE'
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existing && existing.id !== endpoint.id) {
        throw new ValidationError('Another active webhook endpoint already exists for this adapter and domain');
      }
      await endpoint.update({ status: 'ACTIVE', disabledAt: null, updatedBy: actorUserId }, { transaction });
    } else if (normalizedAction === 'DISABLE') {
      await endpoint.update({ status: 'DISABLED', disabledAt: now, updatedBy: actorUserId }, { transaction });
    } else {
      await endpoint.update({
        status: 'REVOKED',
        encryptedVerificationMaterial: null,
        initializationVector: null,
        authenticationTag: null,
        revokedAt: now,
        disabledAt: now,
        updatedBy: actorUserId
      }, { transaction });
    }
    return serializeWebhookEndpoint(endpoint);
  });
}

async function resolveActiveWebhookEndpoint({ endpointKey, env = process.env, adapterRegistry = webhookAdapters }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(endpointKey || ''))) {
    throw new NotFoundError('Provider webhook endpoint not found');
  }
  const endpoint = await IntegrationWebhookEndpoint.findOne({
    where: { endpointKey, status: 'ACTIVE' },
    include: [{
      model: IntegrationConnection,
      as: 'Connection',
      where: { status: { [require('sequelize').Op.ne]: 'DISABLED' } },
      required: true,
      include: [{
        model: IntegrationConnectionScope,
        as: 'Scopes',
        where: { isActive: true },
        required: true
      }]
    }]
  });
  if (!endpoint || !endpoint.Connection.Scopes.some(scope => scope.domain === endpoint.domain)) {
    throw new NotFoundError('Provider webhook endpoint not found');
  }
  const adapter = adapterRegistry.get(endpoint.adapterKey, endpoint.domain);
  if (adapter.adapterVersion !== endpoint.adapterVersion) {
    throw new AppError('Provider webhook adapter version is unavailable.', 503, 'PROVIDER_WEBHOOK_ADAPTER_VERSION_UNAVAILABLE');
  }
  return {
    endpoint,
    connection: endpoint.Connection,
    adapter,
    verificationMaterial: decryptVerificationMaterial(endpoint, { env })
  };
}

module.exports = {
  WEBHOOK_ENDPOINT_STATUSES,
  normalizeConfiguration,
  encryptVerificationMaterial,
  decryptVerificationMaterial,
  serializeWebhookEndpoint,
  listWebhookEndpoints,
  createWebhookEndpoint,
  rotateWebhookEndpoint,
  updateWebhookEndpointLifecycle,
  resolveActiveWebhookEndpoint
};
