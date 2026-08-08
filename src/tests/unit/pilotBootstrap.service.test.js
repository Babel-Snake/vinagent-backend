const {
  DESIRED_BILLING_PROFILE,
  DESIRED_INTEGRATION_CONFIG,
  DESIRED_SETTINGS,
  bootstrapPilot,
  lookupFirebaseAdminIdentity,
  matchesIntegrationConfig,
  parsePilotBootstrapConfig
} = require('../../services/pilotBootstrap.service');
const { assessProviderCapabilities } = require('../../services/providerCapability.service');

const config = {
  wineryId: 7,
  wineryName: 'Pilot Winery',
  wineryTimeZone: 'Australia/Adelaide',
  wineryContactEmail: 'contact@pilot.example',
  adminFirebaseUid: 'firebase-admin-uid',
  adminEmail: 'admin@pilot.example',
  adminDisplayName: 'Pilot Administrator'
};

const firebaseIdentity = {
  uid: config.adminFirebaseUid,
  email: config.adminEmail,
  displayName: config.adminDisplayName,
  disabled: false,
  emailVerified: true
};

function createDb({
  wineries = [],
  settings = null,
  integrationConfig = null,
  billingProfile = null,
  userByUid = null,
  userByEmail = null,
  userCount = 0
} = {}) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const User = {
    findOne: jest.fn(({ where }) => Promise.resolve(
      where.firebaseUid ? userByUid : userByEmail
    )),
    count: jest.fn().mockResolvedValue(userCount),
    create: jest.fn().mockResolvedValue({ id: 3 })
  };
  return {
    transaction,
    db: {
      sequelize: { transaction: jest.fn(callback => callback(transaction)) },
      Winery: {
        findAll: jest.fn().mockResolvedValue(wineries),
        create: jest.fn().mockResolvedValue({ id: config.wineryId })
      },
      WinerySettings: {
        findOne: jest.fn().mockResolvedValue(settings),
        create: jest.fn().mockResolvedValue({ id: 2 })
      },
      WineryIntegrationConfig: {
        findOne: jest.fn().mockResolvedValue(integrationConfig),
        create: jest.fn().mockResolvedValue({ id: 4 })
      },
      WineryBillingProfile: {
        findOne: jest.fn().mockResolvedValue(billingProfile),
        create: jest.fn().mockResolvedValue({ id: 5 })
      },
      User
    }
  };
}

function matchingWinery() {
  return {
    id: config.wineryId,
    name: config.wineryName,
    timeZone: config.wineryTimeZone,
    contactEmail: config.wineryContactEmail
  };
}

function matchingAdmin() {
  return {
    firebaseUid: config.adminFirebaseUid,
    email: config.adminEmail,
    displayName: config.adminDisplayName,
    wineryId: config.wineryId,
    role: 'admin',
    isActive: true
  };
}

describe('pilot bootstrap service', () => {
  it('validates and normalizes required bootstrap configuration', () => {
    expect(parsePilotBootstrapConfig({
      DEPLOYMENT_WINERY_ID: '7',
      PILOT_WINERY_NAME: ' Pilot Winery ',
      PILOT_WINERY_TIME_ZONE: 'Australia/Adelaide',
      PILOT_WINERY_CONTACT_EMAIL: 'CONTACT@PILOT.EXAMPLE',
      PILOT_ADMIN_FIREBASE_UID: config.adminFirebaseUid,
      PILOT_ADMIN_EMAIL: 'ADMIN@PILOT.EXAMPLE',
      PILOT_ADMIN_DISPLAY_NAME: config.adminDisplayName
    })).toEqual(config);

    expect(() => parsePilotBootstrapConfig({
      ...config,
      DEPLOYMENT_WINERY_ID: '7',
      PILOT_WINERY_NAME: config.wineryName,
      PILOT_WINERY_TIME_ZONE: 'Not/A-Timezone',
      PILOT_WINERY_CONTACT_EMAIL: config.wineryContactEmail,
      PILOT_ADMIN_FIREBASE_UID: config.adminFirebaseUid,
      PILOT_ADMIN_EMAIL: config.adminEmail,
      PILOT_ADMIN_DISPLAY_NAME: config.adminDisplayName
    })).toThrow(expect.objectContaining({ code: 'PILOT_WINERY_TIME_ZONE_INVALID' }));
  });

  it('verifies an existing active and verified Firebase identity without creating it', async () => {
    const firebaseAuth = { getUser: jest.fn().mockResolvedValue(firebaseIdentity) };

    await expect(lookupFirebaseAdminIdentity({ firebaseAuth, config }))
      .resolves.toBe(firebaseIdentity);
    expect(firebaseAuth.getUser).toHaveBeenCalledWith(config.adminFirebaseUid);

    await expect(lookupFirebaseAdminIdentity({
      firebaseAuth: {
        getUser: jest.fn().mockResolvedValue({ ...firebaseIdentity, emailVerified: false })
      },
      config
    })).rejects.toMatchObject({ code: 'FIREBASE_ADMIN_EMAIL_NOT_VERIFIED' });
  });

  it('creates only the explicit winery, safe settings/integrations, and bound admin', async () => {
    const { db, transaction } = createDb();

    const result = await bootstrapPilot({ db, config, firebaseIdentity });

    expect(result).toEqual({
      createdResources: ['winery', 'winery_settings', 'winery_integration_config', 'winery_billing_profile', 'admin_user'],
      matchedResources: []
    });
    expect(db.Winery.create).toHaveBeenCalledWith({
      id: config.wineryId,
      name: config.wineryName,
      timeZone: config.wineryTimeZone,
      contactEmail: config.wineryContactEmail
    }, { transaction });
    expect(db.WinerySettings.create).toHaveBeenCalledWith({
      wineryId: config.wineryId,
      ...DESIRED_SETTINGS
    }, { transaction });
    expect(db.WineryIntegrationConfig.create).toHaveBeenCalledWith({
      wineryId: config.wineryId,
      ...DESIRED_INTEGRATION_CONFIG
    }, { transaction });
    expect(db.WineryBillingProfile.create).toHaveBeenCalledWith(expect.objectContaining({
      wineryId: config.wineryId,
      ...DESIRED_BILLING_PROFILE,
      meteringStartedAt: expect.any(Date)
    }), { transaction });
    expect(db.User.create).toHaveBeenCalledWith({
      firebaseUid: config.adminFirebaseUid,
      email: config.adminEmail,
      displayName: config.adminDisplayName,
      role: 'admin',
      wineryId: config.wineryId,
      isActive: true
    }, { transaction });
  });

  it('is idempotent for exactly matching records', async () => {
    const admin = matchingAdmin();
    const { db } = createDb({
      wineries: [matchingWinery()],
      settings: { ...DESIRED_SETTINGS },
      integrationConfig: { ...DESIRED_INTEGRATION_CONFIG },
      billingProfile: { ...DESIRED_BILLING_PROFILE, meteringStartedAt: new Date() },
      userByUid: admin,
      userByEmail: admin,
      userCount: 4
    });

    const result = await bootstrapPilot({ db, config, firebaseIdentity });

    expect(result).toEqual({
      createdResources: [],
      matchedResources: ['winery', 'winery_settings', 'winery_integration_config', 'winery_billing_profile', 'admin_user']
    });
    expect(db.Winery.create).not.toHaveBeenCalled();
    expect(db.WinerySettings.create).not.toHaveBeenCalled();
    expect(db.WineryIntegrationConfig.create).not.toHaveBeenCalled();
    expect(db.WineryBillingProfile.create).not.toHaveBeenCalled();
    expect(db.User.create).not.toHaveBeenCalled();
    expect(db.User.count).not.toHaveBeenCalled();
  });

  it('fails closed on another winery, mismatched settings, or occupied identity', async () => {
    const otherWinery = createDb({
      wineries: [{ ...matchingWinery(), id: 8 }]
    });
    await expect(bootstrapPilot({ db: otherWinery.db, config, firebaseIdentity }))
      .rejects.toMatchObject({ code: 'DATABASE_OCCUPIED_BY_OTHER_WINERY' });

    const conflictingSettings = createDb({
      wineries: [matchingWinery()],
      settings: { ...DESIRED_SETTINGS, enableBookingModule: true },
      integrationConfig: { ...DESIRED_INTEGRATION_CONFIG }
    });
    await expect(bootstrapPilot({ db: conflictingSettings.db, config, firebaseIdentity }))
      .rejects.toMatchObject({ code: 'WINERY_SETTINGS_CONFLICT' });

    const occupiedIdentity = createDb({
      wineries: [matchingWinery()],
      settings: { ...DESIRED_SETTINGS },
      integrationConfig: { ...DESIRED_INTEGRATION_CONFIG },
      userByUid: { ...matchingAdmin(), wineryId: 8 }
    });
    await expect(bootstrapPilot({ db: occupiedIdentity.db, config, firebaseIdentity }))
      .rejects.toMatchObject({ code: 'ADMIN_IDENTITY_CONFLICT' });

    const occupiedWinery = createDb({
      wineries: [matchingWinery()],
      settings: { ...DESIRED_SETTINGS },
      integrationConfig: { ...DESIRED_INTEGRATION_CONFIG },
      userCount: 1
    });
    await expect(bootstrapPilot({ db: occupiedWinery.db, config, firebaseIdentity }))
      .rejects.toMatchObject({ code: 'WINERY_USERS_ALREADY_EXIST' });
  });

  it('creates an integration configuration that makes disabled provider capabilities ready', () => {
    expect(matchesIntegrationConfig(DESIRED_INTEGRATION_CONFIG)).toBe(true);
    expect(assessProviderCapabilities({
      integrationConfig: DESIRED_INTEGRATION_CONFIG,
      winerySettings: DESIRED_SETTINGS,
      areaIntegrationConfigs: [],
      env: { EMAIL_SYNC_ENABLED: 'false' }
    })).toMatchObject({ ready: true });
  });

  it('fails closed instead of overwriting an occupied integration configuration', async () => {
    const conflict = createDb({
      wineries: [matchingWinery()],
      settings: { ...DESIRED_SETTINGS },
      integrationConfig: {
        ...DESIRED_INTEGRATION_CONFIG,
        channelsEnabled: ['email']
      }
    });

    await expect(bootstrapPilot({ db: conflict.db, config, firebaseIdentity }))
      .rejects.toMatchObject({ code: 'WINERY_INTEGRATION_CONFIG_CONFLICT' });
  });
});
