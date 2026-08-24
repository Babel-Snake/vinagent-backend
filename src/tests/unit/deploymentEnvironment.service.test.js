const path = require('path');
const {
  isExactHttpsOrigin,
  validateProductionEnvironment
} = require('../../services/deploymentEnvironment.service');

function validEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    FIREBASE_PRIVATE_KEY: 'private-key',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
    FIREBASE_PROJECT_ID: 'project',
    DB_HOST: 'db',
    DB_USER: 'user',
    DB_PASSWORD: 'password',
    DB_NAME: 'vinagent',
    DEPLOYMENT_WINERY_ID: '1',
    PUBLIC_URL: 'https://api.example.com',
    PUBLIC_APP_URL: 'https://app.example.com',
    CORS_ORIGIN: 'https://app.example.com',
    EMAIL_WEBHOOK_SECRET: 'webhook-secret',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+15551234567',
    ATTACHMENT_STORAGE_ROOT: path.resolve('attachments'),
    PIN_SESSION_SECRET: 'a'.repeat(32),
    RETELL_API_KEY: 'retell-key',
    AI_SKIP: 'true',
    ...overrides
  };
}

describe('production environment validation', () => {
  test('accepts one exact HTTPS CORS origin', () => {
    expect(isExactHttpsOrigin('https://app.example.com')).toBe(true);
    expect(validateProductionEnvironment(validEnvironment()).ready).toBe(true);
  });

  test.each([
    'http://app.example.com',
    'https://app.example.com/path',
    'https://app.example.com?query=1',
    'https://app.example.com#fragment',
    'https://user:pass@app.example.com',
    'https://app.example.com,https://other.example.com',
    'https://app.example.com/'
  ])('rejects malformed or non-exact CORS origin %s', value => {
    const result = validateProductionEnvironment(validEnvironment({ CORS_ORIGIN: value }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'CORS_ORIGIN_INVALID',
      variable: 'CORS_ORIGIN'
    });
  });

  test('requires CORS_ORIGIN in production', () => {
    const result = validateProductionEnvironment(validEnvironment({ CORS_ORIGIN: '' }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual({ code: 'ENV_REQUIRED', variable: 'CORS_ORIGIN' });
  });

  test('requires the deployment runtime itself to use production mode', () => {
    const result = validateProductionEnvironment(validEnvironment({ NODE_ENV: 'development' }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual({ code: 'NODE_ENV_INVALID', variable: 'NODE_ENV' });
  });

  test.each([
    ['PUBLIC_URL', 'PUBLIC_URL_INVALID'],
    ['PUBLIC_APP_URL', 'PUBLIC_APP_URL_INVALID']
  ])('requires %s to be one exact HTTPS origin', (variable, code) => {
    for (const invalid of [
      'http://example.com',
      'https://example.com/path',
      'https://user:password@example.com',
      'https://example.com?query=1',
      'https://example.com#fragment',
      'https://example.com/'
    ]) {
      const result = validateProductionEnvironment(validEnvironment({ [variable]: invalid }));
      expect(result.issues).toContainEqual({ code, variable });
    }
  });

  test('validates the active credential key and retained rotation keys when the store is enabled', () => {
    const activeKey = Buffer.alloc(32, 1).toString('base64');
    const previousKey = Buffer.alloc(32, 2).toString('base64');
    const enabled = validEnvironment({
      INTEGRATION_CREDENTIALS_ENABLED: 'true',
      INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID: 'production-v2',
      INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: activeKey,
      INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON: JSON.stringify({ 'production-v1': previousKey }),
      INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS: 'bookings.example.com,bookings.example.com:8443'
    });
    expect(validateProductionEnvironment(enabled).ready).toBe(true);

    for (const previousKeys of [
      '{not-json',
      '[]',
      JSON.stringify({ 'production-v2': previousKey }),
      JSON.stringify({ 'production-v1': Buffer.alloc(16).toString('base64') })
    ]) {
      const result = validateProductionEnvironment({
        ...enabled,
        INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON: previousKeys
      });
      expect(result.issues).toContainEqual({
        code: 'INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_INVALID',
        variable: 'INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON'
      });
    }
  });

  test('requires worker, credential storage, and valid bounded policy when automatic booking sync is enabled', () => {
    const incomplete = validateProductionEnvironment(validEnvironment({
      INTEGRATION_BOOKING_SCHEDULER_ENABLED: 'true'
    }));
    expect(incomplete.issues).toEqual(expect.arrayContaining([
      { code: 'BOOKING_SCHEDULER_WORKER_REQUIRED', variable: 'INTEGRATION_WORKER_ENABLED' },
      { code: 'BOOKING_SCHEDULER_CREDENTIALS_REQUIRED', variable: 'INTEGRATION_CREDENTIALS_ENABLED' }
    ]));

    const configured = validEnvironment({
      INTEGRATION_BOOKING_SCHEDULER_ENABLED: 'true',
      INTEGRATION_WORKER_ENABLED: 'true',
      INTEGRATION_CREDENTIALS_ENABLED: 'true',
      INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID: 'production-v1',
      INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
      INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS: 'bookings.example.com',
      INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON: JSON.stringify({
        opentable: { minimumSpacingSeconds: 15 }
      })
    });
    expect(validateProductionEnvironment(configured).ready).toBe(true);
    const invalid = validateProductionEnvironment({
      ...configured,
      INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS: '168',
      INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS: '744'
    });
    expect(invalid.issues).toContainEqual({
      code: 'BOOKING_SCHEDULER_CONFIG_INVALID',
      variable: 'INTEGRATION_BOOKING_SCHEDULER_*'
    });
  });
});
