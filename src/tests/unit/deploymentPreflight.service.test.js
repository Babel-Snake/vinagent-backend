const path = require('path');
const {
  environmentPreflight,
  runDeploymentPreflight
} = require('../../services/deploymentPreflight.service');
const {
  DESIRED_INTEGRATION_CONFIG,
  DESIRED_SETTINGS
} = require('../../services/pilotBootstrap.service');

function validEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    FIREBASE_PRIVATE_KEY: 'private-key-secret',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
    FIREBASE_PROJECT_ID: 'project',
    DB_HOST: 'db',
    DB_USER: 'user',
    DB_PASSWORD: 'database-secret',
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
    RETELL_API_KEY: 'retell-secret',
    AI_SKIP: 'true',
    ...overrides
  };
}

function readOnlyDb() {
  return {
    sequelize: { authenticate: jest.fn().mockResolvedValue(undefined) },
    Winery: { findByPk: jest.fn().mockResolvedValue({ id: 1 }) },
    User: {
      findAll: jest.fn().mockResolvedValue([{ firebaseUid: 'bound-admin-uid' }])
    },
    WineryBillingProfile: {
      findOne: jest.fn().mockResolvedValue({
        lifecycleStatus: 'PILOT',
        planCode: 'pilot',
        billingProvider: 'none',
        meteringStartedAt: new Date()
      })
    },
    WineryIntegrationConfig: { findOne: jest.fn().mockResolvedValue(null) },
    WinerySettings: { findOne: jest.fn().mockResolvedValue(null) },
    OperationalAreaIntegrationConfig: { findAll: jest.fn().mockResolvedValue([]) }
  };
}

describe('deployment preflight', () => {
  test('stops before database access when static production config is invalid', async () => {
    const db = readOnlyDb();
    const result = await runDeploymentPreflight({
      db,
      env: validEnvironment({ CORS_ORIGIN: 'http://localhost:3001' })
    });

    expect(result.status).toBe('not_ready');
    expect(result.checks.environment.code).toBe('PRODUCTION_ENVIRONMENT_INVALID');
    expect(db.sequelize.authenticate).not.toHaveBeenCalled();
  });

  test('uses only read methods and never exposes configured secret values', async () => {
    const db = readOnlyDb();
    const env = validEnvironment();
    const result = await runDeploymentPreflight({
      db,
      env,
      inspectMigrations: jest.fn().mockResolvedValue({
        ready: true,
        expectedCount: 3,
        appliedCount: 3
      }),
      validateStorage: jest.fn().mockResolvedValue({ ready: true }),
      assessProviders: jest.fn().mockReturnValue({
        ready: true,
        capabilities: [{ capability: 'sms_delivery', status: 'pass', code: 'TWILIO_CONFIGURED' }]
      })
    });

    expect(result.status).toBe('ready');
    expect(db.sequelize.authenticate).toHaveBeenCalledTimes(1);
    expect(db.Winery.findByPk).toHaveBeenCalledWith(1, { attributes: ['id'] });
    expect(db.User.findAll).toHaveBeenCalledWith({
      where: { wineryId: 1, role: 'admin', isActive: true },
      attributes: ['firebaseUid']
    });
    expect(result.checks.deploymentAdmin).toEqual({
      status: 'pass',
      code: 'DEPLOYMENT_ADMIN_FOUND'
    });
    expect(result.checks.usageMetering).toEqual({
      status: 'pass',
      code: 'USAGE_METERING_PROFILE_READY'
    });
    expect(db.WineryIntegrationConfig.findOne).toHaveBeenCalledWith({ where: { wineryId: 1 } });
    const serialized = JSON.stringify(result);
    for (const secret of [env.DB_PASSWORD, env.PIN_SESSION_SECRET, env.TWILIO_AUTH_TOKEN, env.RETELL_API_KEY]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test('static result lists variable names but not values', () => {
    const env = validEnvironment({ DB_PASSWORD: '' });
    const result = environmentPreflight(env);
    expect(result).toMatchObject({ status: 'fail', code: 'PRODUCTION_ENVIRONMENT_INVALID' });
    expect(result.issues).toContainEqual({ code: 'ENV_REQUIRED', variable: 'DB_PASSWORD' });
    expect(JSON.stringify(result)).not.toContain('database-secret');
  });

  test('fails closed when the deployment winery has no active Firebase-bound admin', async () => {
    const db = readOnlyDb();
    db.User.findAll.mockResolvedValue([
      { firebaseUid: '' },
      { firebaseUid: '   ' }
    ]);

    const result = await runDeploymentPreflight({
      db,
      env: validEnvironment(),
      inspectMigrations: jest.fn().mockResolvedValue({
        ready: true,
        expectedCount: 3,
        appliedCount: 3
      }),
      validateStorage: jest.fn().mockResolvedValue({ ready: true }),
      assessProviders: jest.fn().mockReturnValue({ ready: true, capabilities: [] })
    });

    expect(result.status).toBe('not_ready');
    expect(result.checks.deploymentAdmin).toEqual({
      status: 'fail',
      code: 'DEPLOYMENT_ADMIN_NOT_FOUND'
    });
  });

  test('fails closed when the deployment has no initialized usage metering profile', async () => {
    const db = readOnlyDb();
    db.WineryBillingProfile.findOne.mockResolvedValue(null);

    const result = await runDeploymentPreflight({
      db,
      env: validEnvironment(),
      inspectMigrations: jest.fn().mockResolvedValue({ ready: true, expectedCount: 4, appliedCount: 4 }),
      validateStorage: jest.fn().mockResolvedValue({ ready: true }),
      assessProviders: jest.fn().mockReturnValue({ ready: true, capabilities: [] })
    });

    expect(result.status).toBe('not_ready');
    expect(result.checks.usageMetering).toEqual({
      status: 'fail',
      code: 'USAGE_METERING_PROFILE_NOT_READY'
    });
  });

  test('bootstrap-safe settings and disabled integration config satisfy provider preflight', async () => {
    const db = readOnlyDb();
    db.WinerySettings.findOne.mockResolvedValue(DESIRED_SETTINGS);
    db.WineryIntegrationConfig.findOne.mockResolvedValue(DESIRED_INTEGRATION_CONFIG);

    const result = await runDeploymentPreflight({
      db,
      env: validEnvironment({ EMAIL_SYNC_ENABLED: 'false' }),
      inspectMigrations: jest.fn().mockResolvedValue({
        ready: true,
        expectedCount: 3,
        appliedCount: 3
      }),
      validateStorage: jest.fn().mockResolvedValue({ ready: true })
    });

    expect(result.status).toBe('ready');
    expect(result.checks.deploymentAdmin.code).toBe('DEPLOYMENT_ADMIN_FOUND');
    expect(result.checks.providers).toMatchObject({
      status: 'pass',
      code: 'ENABLED_PROVIDER_CAPABILITIES_READY'
    });
  });
});
