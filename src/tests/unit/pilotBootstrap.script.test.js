const {
  DESIRED_BILLING_PROFILE,
  DESIRED_INTEGRATION_CONFIG,
  DESIRED_SETTINGS
} = require('../../services/pilotBootstrap.service');
const { main } = require('../../scripts/pilotBootstrap');

const env = {
  DEPLOYMENT_WINERY_ID: '7',
  PILOT_WINERY_NAME: 'Pilot Winery',
  PILOT_WINERY_TIME_ZONE: 'Australia/Adelaide',
  PILOT_WINERY_CONTACT_EMAIL: 'contact@pilot.example',
  PILOT_ADMIN_FIREBASE_UID: 'firebase-admin-uid',
  PILOT_ADMIN_EMAIL: 'admin@pilot.example',
  PILOT_ADMIN_DISPLAY_NAME: 'Pilot Administrator',
  DB_PASSWORD: 'must-not-appear'
};

describe('pilot bootstrap script', () => {
  it('verifies Firebase and prints only resource names', async () => {
    const output = [];
    const firebaseAuth = {
      getUser: jest.fn().mockResolvedValue({
        uid: env.PILOT_ADMIN_FIREBASE_UID,
        email: env.PILOT_ADMIN_EMAIL,
        displayName: env.PILOT_ADMIN_DISPLAY_NAME,
        disabled: false,
        emailVerified: true
      })
    };
    const db = {
      sequelize: {
        transaction: jest.fn(callback => callback({ LOCK: { UPDATE: 'UPDATE' } })),
        close: jest.fn().mockResolvedValue(undefined)
      },
      Winery: {
        findAll: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 7 })
      },
      WinerySettings: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...DESIRED_SETTINGS })
      },
      WineryIntegrationConfig: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...DESIRED_INTEGRATION_CONFIG })
      },
      WineryBillingProfile: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...DESIRED_BILLING_PROFILE })
      },
      User: {
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 1 })
      }
    };

    const exitCode = await main({
      env,
      loadDb: () => db,
      loadFirebaseAuth: () => firebaseAuth,
      stdout: { write: value => output.push(value) }
    });

    const text = output.join('');
    expect(exitCode).toBe(0);
    expect(JSON.parse(text)).toEqual({
      status: 'configured',
      action: 'pilot_bootstrap',
      createdResources: ['winery', 'winery_settings', 'winery_integration_config', 'winery_billing_profile', 'admin_user'],
      matchedResources: []
    });
    for (const sensitiveValue of [
      env.PILOT_WINERY_NAME,
      env.PILOT_WINERY_CONTACT_EMAIL,
      env.PILOT_ADMIN_FIREBASE_UID,
      env.PILOT_ADMIN_EMAIL,
      env.PILOT_ADMIN_DISPLAY_NAME,
      env.DB_PASSWORD
    ]) {
      expect(text).not.toContain(sensitiveValue);
    }
    expect(firebaseAuth.getUser).toHaveBeenCalledWith(env.PILOT_ADMIN_FIREBASE_UID);
    expect(db.sequelize.close).toHaveBeenCalled();
  });

  it('fails before loading Firebase or the database when inputs are incomplete', async () => {
    const output = [];
    const loadDb = jest.fn();
    const loadFirebaseAuth = jest.fn();

    const exitCode = await main({
      env: { DEPLOYMENT_WINERY_ID: '7' },
      loadDb,
      loadFirebaseAuth,
      stdout: { write: value => output.push(value) }
    });

    expect(exitCode).toBe(1);
    expect(loadFirebaseAuth).not.toHaveBeenCalled();
    expect(loadDb).not.toHaveBeenCalled();
    expect(JSON.parse(output.join(''))).toMatchObject({
      status: 'failed',
      code: 'PILOT_WINERY_NAME_INVALID'
    });
  });
});
