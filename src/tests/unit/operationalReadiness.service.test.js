const path = require('path');
const { checkOperationalReadiness } = require('../../services/operationalReadiness.service');

function productionEnvironment() {
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
    AI_SKIP: 'true'
  };
}

describe('operationalReadiness service', () => {
  test('reports draining immediately without touching dependencies', async () => {
    const sequelize = { authenticate: jest.fn() };
    const result = await checkOperationalReadiness({
      sequelize,
      isDraining: () => true
    });

    expect(result).toEqual({
      ready: false,
      checks: { runtime: { status: 'fail', code: 'SERVER_DRAINING' } }
    });
    expect(sequelize.authenticate).not.toHaveBeenCalled();
  });

  test('blocks migration readiness when the database is unavailable', async () => {
    const inspectMigrations = jest.fn();
    const result = await checkOperationalReadiness({
      sequelize: { authenticate: jest.fn().mockRejectedValue(new Error('connection detail')) },
      env: productionEnvironment(),
      environment: 'production',
      validateStorage: jest.fn().mockResolvedValue({ ready: true }),
      inspectMigrations,
      isDraining: () => false
    });

    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({ status: 'fail', code: 'DATABASE_UNAVAILABLE' });
    expect(result.checks.migrations).toEqual({ status: 'blocked', code: 'DATABASE_UNAVAILABLE' });
    expect(inspectMigrations).not.toHaveBeenCalled();
  });
});
