const path = require('path');
const { runStartupSafetyChecks } = require('../../services/startupSafety.service');

function productionEnvironment(overrides = {}) {
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
    EMAIL_WEBHOOK_SECRET: 'email-webhook-secret',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio-secret',
    TWILIO_PHONE_NUMBER: '+15551234567',
    ATTACHMENT_STORAGE_ROOT: path.resolve('attachments'),
    PIN_SESSION_SECRET: 'a'.repeat(32),
    RETELL_API_KEY: 'retell-key',
    AI_SKIP: 'true',
    ...overrides
  };
}

describe('startupSafety service', () => {
  test('checks production dependencies before reporting ready', async () => {
    const sequelize = { authenticate: jest.fn().mockResolvedValue(undefined) };
    const validateStorage = jest.fn().mockResolvedValue({ ready: true });
    const inspectMigrations = jest.fn().mockResolvedValue({ ready: true });

    const result = await runStartupSafetyChecks({
      sequelize,
      env: productionEnvironment(),
      environment: 'production',
      validateStorage,
      inspectMigrations
    });

    expect(result.ready).toBe(true);
    expect(sequelize.authenticate).toHaveBeenCalledTimes(1);
    expect(validateStorage).toHaveBeenCalledTimes(1);
    expect(inspectMigrations).toHaveBeenCalledWith({ sequelize });
  });

  test('refuses startup when migrations are pending', async () => {
    await expect(runStartupSafetyChecks({
      sequelize: { authenticate: jest.fn().mockResolvedValue(undefined) },
      env: productionEnvironment(),
      environment: 'production',
      validateStorage: jest.fn().mockResolvedValue({ ready: true }),
      inspectMigrations: jest.fn().mockResolvedValue({ ready: false })
    })).rejects.toMatchObject({ code: 'DATABASE_MIGRATIONS_NOT_CURRENT' });
  });

  test('does not run production-only checks in local development', async () => {
    const validateStorage = jest.fn();
    const inspectMigrations = jest.fn();
    const result = await runStartupSafetyChecks({
      sequelize: { authenticate: jest.fn().mockResolvedValue(undefined) },
      env: {},
      environment: 'development',
      validateStorage,
      inspectMigrations
    });

    expect(result.ready).toBe(true);
    expect(validateStorage).not.toHaveBeenCalled();
    expect(inspectMigrations).not.toHaveBeenCalled();
  });
});
