const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  IntegrationConnection,
  IntegrationConnectionScope,
  IntegrationCredential,
  IntegrationDomainActivation,
  IntegrationConnectionCapability,
  User,
  sequelize
} = require('../models');
const AppError = require('../utils/AppError');
const { NotFoundError, ValidationError } = require('../utils/errors');
const integrationConfigurationAuthorityService = require('./integrationConfigurationAuthority.service');

const CREDENTIAL_TYPES = Object.freeze([
  'BEARER_TOKEN',
  'API_KEY',
  'BASIC',
  'OAUTH_CLIENT_CREDENTIALS'
]);
const CREDENTIAL_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_SECRET_LENGTH = 8192;

class CredentialStoreUnavailableError extends AppError {
  constructor() {
    super('Protected integration credential storage is unavailable.', 503, 'CREDENTIAL_STORE_UNAVAILABLE');
  }
}

class CredentialDecryptionError extends AppError {
  constructor() {
    super('The protected integration credential cannot be decrypted.', 503, 'CREDENTIAL_DECRYPTION_FAILED');
  }
}

function isCredentialStoreEnabled(env = process.env) {
  return env.INTEGRATION_CREDENTIALS_ENABLED === 'true';
}

function decodeEncryptionKey(value) {
  const encoded = String(value || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new CredentialStoreUnavailableError();
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new CredentialStoreUnavailableError();
  return key;
}

function loadCredentialKeyring(env = process.env) {
  if (!isCredentialStoreEnabled(env)) throw new CredentialStoreUnavailableError();
  const activeKeyId = String(env.INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID || '').trim();
  if (!KEY_ID_PATTERN.test(activeKeyId)) throw new CredentialStoreUnavailableError();
  const keys = new Map();
  keys.set(activeKeyId, decodeEncryptionKey(env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY));

  if (String(env.INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON || '').trim()) {
    let previous;
    try {
      previous = JSON.parse(env.INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON);
    } catch {
      throw new CredentialStoreUnavailableError();
    }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous) || Object.keys(previous).length > 10) {
      throw new CredentialStoreUnavailableError();
    }
    for (const [keyId, encoded] of Object.entries(previous)) {
      if (!KEY_ID_PATTERN.test(keyId) || keyId === activeKeyId) throw new CredentialStoreUnavailableError();
      keys.set(keyId, decodeEncryptionKey(encoded));
    }
  }
  return { activeKeyId, keys };
}

function requireSecretString(value, fieldName) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_SECRET_LENGTH) {
    throw new ValidationError(`${fieldName} must be a non-empty bounded string`);
  }
  return value;
}

function normalizeCredentialSecret(credentialType, secret) {
  const type = String(credentialType || '').trim().toUpperCase();
  if (!CREDENTIAL_TYPES.includes(type)) throw new ValidationError('credentialType is not supported');
  if (!secret || typeof secret !== 'object' || Array.isArray(secret)) {
    throw new ValidationError('secret must be an object');
  }

  let normalized;
  if (type === 'BEARER_TOKEN') {
    normalized = { token: requireSecretString(secret.token, 'secret.token') };
  } else if (type === 'API_KEY') {
    normalized = { apiKey: requireSecretString(secret.apiKey, 'secret.apiKey') };
  } else if (type === 'BASIC') {
    normalized = {
      username: requireSecretString(secret.username, 'secret.username'),
      password: requireSecretString(secret.password, 'secret.password')
    };
  } else {
    normalized = {
      clientId: requireSecretString(secret.clientId, 'secret.clientId'),
      clientSecret: requireSecretString(secret.clientSecret, 'secret.clientSecret')
    };
  }

  if (Object.keys(secret).some(key => !Object.prototype.hasOwnProperty.call(normalized, key))) {
    throw new ValidationError('secret contains fields that are not allowed for credentialType');
  }
  return { credentialType: type, secret: normalized };
}

const credentialAad = ({ credentialId, wineryId, connectionId, schemaVersion = '1' }) => (
  Buffer.from(`vinagent.integration-credential|${credentialId}|${wineryId}|${connectionId}|${schemaVersion}`, 'utf8')
);

function encryptCredentialPayload({ credentialId, wineryId, connectionId, credentialType, secret, env = process.env }) {
  const { activeKeyId, keys } = loadCredentialKeyring(env);
  const key = keys.get(activeKeyId);
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, initializationVector);
  cipher.setAAD(credentialAad({ credentialId, wineryId, connectionId }));
  const plaintext = Buffer.from(JSON.stringify({ credentialType, secret }), 'utf8');
  try {
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      encryptedPayload: encrypted.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      keyId: activeKeyId
    };
  } finally {
    plaintext.fill(0);
  }
}

function decryptCredentialRecord(record, { env = process.env } = {}) {
  if (!record || record.status !== 'ACTIVE' || !record.encryptedPayload
    || !record.initializationVector || !record.authenticationTag) {
    throw new CredentialDecryptionError();
  }
  const { keys } = loadCredentialKeyring(env);
  const key = keys.get(record.keyId);
  if (!key) throw new CredentialDecryptionError();
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(record.initializationVector, 'base64')
    );
    decipher.setAAD(credentialAad(record));
    decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64'));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.encryptedPayload, 'base64')),
      decipher.final()
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    const normalized = normalizeCredentialSecret(parsed.credentialType, parsed.secret);
    if (normalized.credentialType !== record.credentialType) throw new Error('Credential type mismatch');
    return normalized;
  } catch {
    throw new CredentialDecryptionError();
  } finally {
    if (plaintext) plaintext.fill(0);
  }
}

function serializeCredentialMetadata(record) {
  if (!record) return {
    configured: false,
    credentialType: null,
    status: null,
    rotatedAt: null,
    lastVerifiedAt: null,
    lastVerificationStatus: null,
    lastVerificationErrorCode: null
  };
  return {
    configured: record.status === 'ACTIVE',
    credentialType: record.credentialType,
    status: record.status,
    rotatedAt: record.rotatedAt,
    lastVerifiedAt: record.lastVerifiedAt,
    lastVerificationStatus: record.lastVerificationStatus,
    lastVerificationErrorCode: record.lastVerificationErrorCode
  };
}

async function getConnectionCredentialMetadata({ wineryId, connectionId }) {
  const connection = await IntegrationConnection.findOne({ where: { id: connectionId, wineryId } });
  if (!connection) throw new NotFoundError('Integration connection not found');
  if (!connection.authReference) return serializeCredentialMetadata(null);
  const credential = await IntegrationCredential.findOne({
    where: { credentialId: connection.authReference, connectionId, wineryId }
  });
  return serializeCredentialMetadata(credential);
}

async function upsertConnectionCredential({ wineryId, connectionId, actorUserId, credentialType, secret, env = process.env }) {
  const normalized = normalizeCredentialSecret(credentialType, secret);
  const credentialId = crypto.randomUUID();
  const encrypted = encryptCredentialPayload({
    credentialId,
    wineryId,
    connectionId,
    ...normalized,
    env
  });
  const now = new Date();

  return sequelize.transaction(async transaction => {
    const [connection, actor] = await Promise.all([
      IntegrationConnection.findOne({
        where: { id: connectionId, wineryId },
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction })
    ]);
    if (!connection) throw new NotFoundError('Integration connection not found');
    if (!actor) throw new ValidationError('Credential actor does not belong to the winery');

    const scopes = await IntegrationConnectionScope.findAll({
      where: { wineryId, connectionId, isActive: true },
      attributes: ['domain'],
      transaction
    });
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: scopes.map(scope => scope.domain),
      transaction
    });

    if (connection.authReference) {
      await IntegrationCredential.update({
        status: 'REVOKED',
        encryptedPayload: null,
        initializationVector: null,
        authenticationTag: null,
        revokedAt: now,
        updatedBy: actorUserId
      }, {
        where: {
          credentialId: connection.authReference,
          connectionId,
          wineryId,
          status: 'ACTIVE'
        },
        transaction
      });
    }

    const credential = await IntegrationCredential.create({
      credentialId,
      wineryId,
      connectionId,
      credentialType: normalized.credentialType,
      status: 'ACTIVE',
      schemaVersion: '1',
      ...encrypted,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      rotatedAt: now
    }, { transaction });
    await connection.update({
      authReference: credentialId,
      status: connection.status === 'DISABLED' ? 'DISABLED' : 'PENDING',
      connectedAt: null,
      lastErrorCode: null,
      lastErrorSummary: null,
      updatedBy: actorUserId
    }, { transaction });
    await IntegrationDomainActivation.update({
      status: 'DISABLED',
      disabledAt: now,
      disabledBy: actorUserId,
      disabledReason: 'Connection credential changed after activation.'
    }, { where: { wineryId, connectionId, status: 'ACTIVE' }, transaction });
    await IntegrationConnectionCapability.update({
      enabled: false,
      availabilityStatus: 'UNAVAILABLE',
      unavailableReason: 'DOMAIN_ACTIVATION_INVALIDATED_BY_CREDENTIAL_CHANGE'
    }, {
      where: { wineryId, connectionId, capabilityKey: { [Op.like]: '%.canonical.events.live' } },
      transaction
    });
    return serializeCredentialMetadata(credential);
  });
}

async function revokeConnectionCredential({ wineryId, connectionId, actorUserId }) {
  return sequelize.transaction(async transaction => {
    const [connection, actor] = await Promise.all([
      IntegrationConnection.findOne({
        where: { id: connectionId, wineryId },
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction })
    ]);
    if (!connection) throw new NotFoundError('Integration connection not found');
    if (!actor) throw new ValidationError('Credential actor does not belong to the winery');
    const scopes = await IntegrationConnectionScope.findAll({
      where: { wineryId, connectionId, isActive: true },
      attributes: ['domain'],
      transaction
    });
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: scopes.map(scope => scope.domain),
      transaction
    });
    if (!connection.authReference) return { revoked: false };
    const now = new Date();
    await IntegrationCredential.update({
      status: 'REVOKED',
      encryptedPayload: null,
      initializationVector: null,
      authenticationTag: null,
      revokedAt: now,
      updatedBy: actorUserId
    }, {
      where: { credentialId: connection.authReference, connectionId, wineryId, status: 'ACTIVE' },
      transaction
    });
    await connection.update({
      authReference: null,
      status: connection.status === 'DISABLED' ? 'DISABLED' : 'PENDING',
      connectedAt: null,
      lastErrorCode: null,
      lastErrorSummary: null,
      updatedBy: actorUserId
    }, { transaction });
    await IntegrationDomainActivation.update({
      status: 'DISABLED',
      disabledAt: now,
      disabledBy: actorUserId,
      disabledReason: 'Connection credential was revoked.'
    }, { where: { wineryId, connectionId, status: 'ACTIVE' }, transaction });
    await IntegrationConnectionCapability.update({
      enabled: false,
      availabilityStatus: 'UNAVAILABLE',
      unavailableReason: 'DOMAIN_ACTIVATION_INVALIDATED_BY_CREDENTIAL_REVOCATION'
    }, {
      where: { wineryId, connectionId, capabilityKey: { [Op.like]: '%.canonical.events.live' } },
      transaction
    });
    return { revoked: true };
  });
}

async function resolveConnectionCredential({ connection, env = process.env }) {
  if (!connection?.authReference || !CREDENTIAL_REFERENCE_PATTERN.test(connection.authReference)) {
    throw new AppError('Integration connection credentials are not configured.', 409, 'CONNECTION_CREDENTIALS_REQUIRED');
  }
  const credential = await IntegrationCredential.findOne({
    where: {
      credentialId: connection.authReference,
      wineryId: connection.wineryId,
      connectionId: connection.id,
      status: 'ACTIVE'
    }
  });
  if (!credential) throw new AppError('Integration connection credentials are not configured.', 409, 'CONNECTION_CREDENTIALS_REQUIRED');
  const resolved = decryptCredentialRecord(credential, { env });
  await credential.update({ lastUsedAt: new Date() });
  return { ...resolved, credentialId: credential.credentialId };
}

async function markConnectionCredentialVerified({ wineryId, connectionId, credentialId, now = new Date() }) {
  return sequelize.transaction(async transaction => {
    const credential = await IntegrationCredential.findOne({
      where: { credentialId, wineryId, connectionId, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const connection = await IntegrationConnection.findOne({
      where: { id: connectionId, wineryId, authReference: credentialId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!credential || !connection) throw new NotFoundError('Active integration credential was not found');
    if (connection.status === 'DISABLED') throw new ValidationError('Disabled connections cannot be verified');
    await credential.update({
      lastVerifiedAt: now,
      lastVerificationStatus: 'SUCCEEDED',
      lastVerificationErrorCode: null
    }, { transaction });
    await connection.update({
      status: 'CONNECTED',
      connectedAt: connection.connectedAt || now,
      lastHealthCheckedAt: now,
      lastHealthyAt: now,
      lastErrorCode: null,
      lastErrorSummary: null
    }, { transaction });
  });
}

async function markConnectionCredentialVerificationFailed({
  wineryId,
  connectionId,
  credentialId,
  errorCode,
  authenticationRejected = false,
  now = new Date()
}) {
  const normalizedErrorCode = String(errorCode || 'CONNECTION_VERIFICATION_FAILED').slice(0, 120);
  return sequelize.transaction(async transaction => {
    const credential = await IntegrationCredential.findOne({
      where: { credentialId, wineryId, connectionId, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const connection = await IntegrationConnection.findOne({
      where: { id: connectionId, wineryId, authReference: credentialId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!credential || !connection) return;
    await credential.update({
      lastVerifiedAt: now,
      lastVerificationStatus: 'FAILED',
      lastVerificationErrorCode: normalizedErrorCode
    }, { transaction });
    if (connection.status !== 'DISABLED') {
      await connection.update({
        status: authenticationRejected ? 'REAUTH_REQUIRED' : 'ERROR',
        connectedAt: null,
        lastHealthCheckedAt: now,
        lastErrorCode: normalizedErrorCode,
        lastErrorSummary: 'Read-only connection verification failed.'
      }, { transaction });
    }
  });
}

module.exports = {
  CREDENTIAL_TYPES,
  CredentialStoreUnavailableError,
  CredentialDecryptionError,
  isCredentialStoreEnabled,
  loadCredentialKeyring,
  normalizeCredentialSecret,
  encryptCredentialPayload,
  decryptCredentialRecord,
  serializeCredentialMetadata,
  getConnectionCredentialMetadata,
  upsertConnectionCredential,
  revokeConnectionCredential,
  resolveConnectionCredential,
  markConnectionCredentialVerified,
  markConnectionCredentialVerificationFailed
};
