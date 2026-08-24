const REQUIRED_PRODUCTION_ENVIRONMENT = [
  'NODE_ENV',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PROJECT_ID',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DEPLOYMENT_WINERY_ID',
  'PUBLIC_URL',
  'PUBLIC_APP_URL',
  'CORS_ORIGIN',
  'EMAIL_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'ATTACHMENT_STORAGE_ROOT'
];
const { getBookingSyncSchedulerConfig } = require('./bookingSyncSchedulerConfig.service');

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function isExactHttpsOrigin(value) {
  try {
    const normalized = String(value || '').trim();
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && parsed.pathname === '/'
      && !parsed.search
      && !parsed.hash
      && normalized === parsed.origin;
  } catch {
    return false;
  }
}

function isValidCredentialEncryptionKey(value) {
  const encoded = String(value || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  return Buffer.from(encoded, 'base64').length === 32;
}

function isValidAllowedHost(value) {
  try {
    const host = String(value || '').trim().toLowerCase();
    if (!host || host.includes('/') || host.includes('@')) return false;
    const parsed = new URL(`https://${host}`);
    return parsed.host.toLowerCase() === host && parsed.pathname === '/';
  } catch {
    return false;
  }
}

function isValidPreviousCredentialKeys(value, activeKeyId) {
  const encodedKeyring = String(value || '').trim();
  if (!encodedKeyring) return true;
  try {
    const keyring = JSON.parse(encodedKeyring);
    if (!keyring || typeof keyring !== 'object' || Array.isArray(keyring)) return false;
    const entries = Object.entries(keyring);
    if (entries.length > 10) return false;
    return entries.every(([keyId, key]) => (
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(keyId)
      && keyId !== activeKeyId
      && isValidCredentialEncryptionKey(key)
    ));
  } catch {
    return false;
  }
}

function validateProductionEnvironment(env = process.env) {
  const issues = [];
  const addIssue = (code, variable) => issues.push({ code, variable });

  for (const variable of REQUIRED_PRODUCTION_ENVIRONMENT) {
    if (!hasValue(env[variable])) addIssue('ENV_REQUIRED', variable);
  }

  if (hasValue(env.NODE_ENV) && env.NODE_ENV !== 'production') {
    addIssue('NODE_ENV_INVALID', 'NODE_ENV');
  }

  if (!hasValue(env.PIN_SESSION_SECRET) && !hasValue(env.SESSION_SECRET)) {
    addIssue('ENV_REQUIRED', 'PIN_SESSION_SECRET_OR_SESSION_SECRET');
  } else {
    const pinSecret = String(env.PIN_SESSION_SECRET || env.SESSION_SECRET);
    if (pinSecret.length < 32 || pinSecret === 'vinagent-dev-pin-session-secret') {
      addIssue('PIN_SESSION_SECRET_WEAK', 'PIN_SESSION_SECRET_OR_SESSION_SECRET');
    }
  }

  if (!hasValue(env.RETELL_API_KEY) && !hasValue(env.RETELL_WEBHOOK_SECRET)) {
    addIssue('ENV_REQUIRED', 'RETELL_API_KEY_OR_RETELL_WEBHOOK_SECRET');
  }

  if (env.AI_SKIP !== 'true' && !hasValue(env.OPENAI_API_KEY)) {
    addIssue('ENV_REQUIRED', 'OPENAI_API_KEY_OR_AI_SKIP');
  }

  const deploymentWineryId = Number(env.DEPLOYMENT_WINERY_ID);
  if (hasValue(env.DEPLOYMENT_WINERY_ID)
    && (!Number.isInteger(deploymentWineryId) || deploymentWineryId < 1)) {
    addIssue('DEPLOYMENT_WINERY_ID_INVALID', 'DEPLOYMENT_WINERY_ID');
  }

  if (hasValue(env.PUBLIC_URL) && !isExactHttpsOrigin(env.PUBLIC_URL)) {
    addIssue('PUBLIC_URL_INVALID', 'PUBLIC_URL');
  }
  if (hasValue(env.PUBLIC_APP_URL) && !isExactHttpsOrigin(env.PUBLIC_APP_URL)) {
    addIssue('PUBLIC_APP_URL_INVALID', 'PUBLIC_APP_URL');
  }

  if (hasValue(env.CORS_ORIGIN) && !isExactHttpsOrigin(env.CORS_ORIGIN)) {
    addIssue('CORS_ORIGIN_INVALID', 'CORS_ORIGIN');
  }

  if (env.ALLOW_TEST_AUTH_BYPASS === 'true') {
    addIssue('PRODUCTION_FLAG_FORBIDDEN', 'ALLOW_TEST_AUTH_BYPASS');
  }
  if (env.ALLOW_MOCK_INTEGRATIONS === 'true') {
    addIssue('PRODUCTION_FLAG_FORBIDDEN', 'ALLOW_MOCK_INTEGRATIONS');
  }

  if (env.INTEGRATION_BOOKING_SCHEDULER_ENABLED === 'true') {
    if (env.INTEGRATION_WORKER_ENABLED !== 'true') {
      addIssue('BOOKING_SCHEDULER_WORKER_REQUIRED', 'INTEGRATION_WORKER_ENABLED');
    }
    if (env.INTEGRATION_CREDENTIALS_ENABLED !== 'true') {
      addIssue('BOOKING_SCHEDULER_CREDENTIALS_REQUIRED', 'INTEGRATION_CREDENTIALS_ENABLED');
    }
    try {
      getBookingSyncSchedulerConfig(env);
    } catch {
      addIssue('BOOKING_SCHEDULER_CONFIG_INVALID', 'INTEGRATION_BOOKING_SCHEDULER_*');
    }
  }

  if (env.INTEGRATION_CREDENTIALS_ENABLED === 'true') {
    const activeKeyId = String(env.INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(activeKeyId)) {
      addIssue('INTEGRATION_CREDENTIAL_KEY_ID_INVALID', 'INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID');
    }
    if (!isValidCredentialEncryptionKey(env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY)) {
      addIssue('INTEGRATION_CREDENTIAL_KEY_INVALID', 'INTEGRATION_CREDENTIAL_ENCRYPTION_KEY');
    }
    if (!isValidPreviousCredentialKeys(env.INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON, activeKeyId)) {
      addIssue('INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_INVALID', 'INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON');
    }
    const bookingHosts = String(env.INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (bookingHosts.length === 0 || bookingHosts.some(host => !isValidAllowedHost(host))) {
      addIssue('BOOKING_FEED_ALLOWED_HOSTS_INVALID', 'INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS');
    }
  }

  return { ready: issues.length === 0, issues };
}

function formatProductionEnvironmentIssues(issues) {
  return issues.map(issue => `${issue.code}:${issue.variable}`).join(', ');
}

module.exports = {
  REQUIRED_PRODUCTION_ENVIRONMENT,
  formatProductionEnvironmentIssues,
  isValidCredentialEncryptionKey,
  isValidPreviousCredentialKeys,
  isValidAllowedHost,
  isExactHttpsOrigin,
  validateProductionEnvironment
};
