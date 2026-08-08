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

  return { ready: issues.length === 0, issues };
}

function formatProductionEnvironmentIssues(issues) {
  return issues.map(issue => `${issue.code}:${issue.variable}`).join(', ');
}

module.exports = {
  REQUIRED_PRODUCTION_ENVIRONMENT,
  formatProductionEnvironmentIssues,
  isExactHttpsOrigin,
  validateProductionEnvironment
};
