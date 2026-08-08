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
});
