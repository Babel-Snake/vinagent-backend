const Joi = require('joi');
const { parseDeploymentWineryId } = require('./pilotModuleConfiguration.service');

const RESOURCE_NAMES = Object.freeze({
  winery: 'winery',
  settings: 'winery_settings',
  integrationConfig: 'winery_integration_config',
  billingProfile: 'winery_billing_profile',
  admin: 'admin_user'
});

const DESIRED_SETTINGS = Object.freeze({
  tier: 'BASIC',
  enableBookingModule: false,
  enableWineClubModule: false,
  enableOrdersModule: false,
  enableSecureLinks: true,
  enableInsights: false,
  enableVoice: false
});

const DESIRED_INTEGRATION_CONFIG = Object.freeze({
  smsProvider: 'other',
  emailProvider: 'other',
  channelsEnabled: [],
  kioskModeEnabled: false,
  posProvider: 'other',
  crmProvider: 'other',
  bookingProvider: 'other',
  deliveryProvider: 'other',
  providerConnections: {},
  planTier: 'basic'
});

const DESIRED_BILLING_PROFILE = Object.freeze({
  lifecycleStatus: 'PILOT',
  planCode: 'pilot',
  billingProvider: 'none'
});

function bootstrapError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredText(value, code, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw bootstrapError(code);
  return normalized;
}

function normalizedEmail(value, code) {
  const email = requiredText(value, code, 254).toLowerCase();
  const { error } = Joi.string().email({ tlds: { allow: false } }).validate(email);
  if (error) throw bootstrapError(code);
  return email;
}

function validTimeZone(value) {
  const timeZone = requiredText(value, 'PILOT_WINERY_TIME_ZONE_INVALID', 100);
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format();
  } catch {
    throw bootstrapError('PILOT_WINERY_TIME_ZONE_INVALID');
  }
  return timeZone;
}

function parsePilotBootstrapConfig(env = process.env) {
  return {
    wineryId: parseDeploymentWineryId(env.DEPLOYMENT_WINERY_ID),
    wineryName: requiredText(env.PILOT_WINERY_NAME, 'PILOT_WINERY_NAME_INVALID', 255),
    wineryTimeZone: validTimeZone(env.PILOT_WINERY_TIME_ZONE),
    wineryContactEmail: normalizedEmail(
      env.PILOT_WINERY_CONTACT_EMAIL,
      'PILOT_WINERY_CONTACT_EMAIL_INVALID'
    ),
    adminFirebaseUid: requiredText(
      env.PILOT_ADMIN_FIREBASE_UID,
      'PILOT_ADMIN_FIREBASE_UID_INVALID',
      128
    ),
    adminEmail: normalizedEmail(env.PILOT_ADMIN_EMAIL, 'PILOT_ADMIN_EMAIL_INVALID'),
    adminDisplayName: requiredText(
      env.PILOT_ADMIN_DISPLAY_NAME,
      'PILOT_ADMIN_DISPLAY_NAME_INVALID',
      256
    )
  };
}

function assertFirebaseAdminIdentity(identity, config) {
  if (!identity || identity.uid !== config.adminFirebaseUid) {
    throw bootstrapError('FIREBASE_ADMIN_UID_MISMATCH');
  }
  if (String(identity.email || '').trim().toLowerCase() !== config.adminEmail) {
    throw bootstrapError('FIREBASE_ADMIN_EMAIL_MISMATCH');
  }
  if (String(identity.displayName || '').trim() !== config.adminDisplayName) {
    throw bootstrapError('FIREBASE_ADMIN_DISPLAY_NAME_MISMATCH');
  }
  if (identity.disabled) throw bootstrapError('FIREBASE_ADMIN_DISABLED');
  if (!identity.emailVerified) throw bootstrapError('FIREBASE_ADMIN_EMAIL_NOT_VERIFIED');
}

async function lookupFirebaseAdminIdentity({ firebaseAuth, config }) {
  let identity;
  try {
    identity = await firebaseAuth.getUser(config.adminFirebaseUid);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      throw bootstrapError('FIREBASE_ADMIN_NOT_FOUND');
    }
    throw bootstrapError('FIREBASE_ADMIN_LOOKUP_FAILED');
  }
  assertFirebaseAdminIdentity(identity, config);
  return identity;
}

function matchesWinery(winery, config) {
  return Number(winery.id) === config.wineryId
    && String(winery.name || '').trim() === config.wineryName
    && String(winery.timeZone || '').trim() === config.wineryTimeZone
    && String(winery.contactEmail || '').trim().toLowerCase() === config.wineryContactEmail;
}

function matchesSettings(settings) {
  return Object.entries(DESIRED_SETTINGS)
    .every(([field, expected]) => settings[field] === expected);
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function matchesIntegrationConfig(integrationConfig) {
  const channels = parseJsonValue(integrationConfig.channelsEnabled, null);
  const connections = parseJsonValue(integrationConfig.providerConnections, null);
  return Array.isArray(channels)
    && channels.length === 0
    && connections
    && !Array.isArray(connections)
    && Object.keys(connections).length === 0
    && Object.entries(DESIRED_INTEGRATION_CONFIG)
      .filter(([field]) => !['channelsEnabled', 'providerConnections'].includes(field))
      .every(([field, expected]) => integrationConfig[field] === expected);
}

function matchesBillingProfile(profile) {
  return Boolean(profile?.meteringStartedAt)
    && Object.entries(DESIRED_BILLING_PROFILE)
      .every(([field, expected]) => profile[field] === expected)
    && !profile.providerCustomerId
    && !profile.providerSubscriptionId;
}

function matchesAdmin(user, config) {
  return user.firebaseUid === config.adminFirebaseUid
    && String(user.email || '').trim().toLowerCase() === config.adminEmail
    && String(user.displayName || '').trim() === config.adminDisplayName
    && Number(user.wineryId) === config.wineryId
    && user.role === 'admin'
    && user.isActive === true;
}

async function bootstrapPilot({ db, config, firebaseIdentity }) {
  assertFirebaseAdminIdentity(firebaseIdentity, config);

  return db.sequelize.transaction(async transaction => {
    const lock = transaction?.LOCK?.UPDATE;
    const lockOptions = lock ? { lock } : {};
    const wineries = await db.Winery.findAll({
      attributes: ['id', 'name', 'timeZone', 'contactEmail'],
      transaction,
      ...lockOptions
    });

    if (wineries.length > 1 || (wineries.length === 1 && Number(wineries[0].id) !== config.wineryId)) {
      throw bootstrapError('DATABASE_OCCUPIED_BY_OTHER_WINERY');
    }

    const existingWinery = wineries[0] || null;
    if (existingWinery && !matchesWinery(existingWinery, config)) {
      throw bootstrapError('WINERY_CONFIGURATION_CONFLICT');
    }

    const [settings, integrationConfig, billingProfile, userByUid, userByEmail] = await Promise.all([
      db.WinerySettings.findOne({
        where: { wineryId: config.wineryId },
        transaction,
        ...lockOptions
      }),
      db.WineryIntegrationConfig.findOne({
        where: { wineryId: config.wineryId },
        transaction,
        ...lockOptions
      }),
      db.WineryBillingProfile.findOne({
        where: { wineryId: config.wineryId },
        transaction,
        ...lockOptions
      }),
      db.User.findOne({
        where: { firebaseUid: config.adminFirebaseUid },
        transaction,
        ...lockOptions
      }),
      db.User.findOne({
        where: { email: config.adminEmail },
        transaction,
        ...lockOptions
      })
    ]);

    if (settings && !matchesSettings(settings)) {
      throw bootstrapError('WINERY_SETTINGS_CONFLICT');
    }
    if (integrationConfig && !matchesIntegrationConfig(integrationConfig)) {
      throw bootstrapError('WINERY_INTEGRATION_CONFIG_CONFLICT');
    }
    if (billingProfile && !matchesBillingProfile(billingProfile)) {
      throw bootstrapError('WINERY_BILLING_PROFILE_CONFLICT');
    }
    if (userByUid && !matchesAdmin(userByUid, config)) {
      throw bootstrapError('ADMIN_IDENTITY_CONFLICT');
    }
    if (userByEmail && userByEmail.firebaseUid !== config.adminFirebaseUid) {
      throw bootstrapError('ADMIN_EMAIL_CONFLICT');
    }

    if (!userByUid) {
      const occupiedUserCount = await db.User.count({
        where: { wineryId: config.wineryId },
        transaction
      });
      if (occupiedUserCount > 0) throw bootstrapError('WINERY_USERS_ALREADY_EXIST');
    }

    const createdResources = [];
    const matchedResources = [];

    if (existingWinery) {
      matchedResources.push(RESOURCE_NAMES.winery);
    } else {
      await db.Winery.create({
        id: config.wineryId,
        name: config.wineryName,
        timeZone: config.wineryTimeZone,
        contactEmail: config.wineryContactEmail
      }, { transaction });
      createdResources.push(RESOURCE_NAMES.winery);
    }

    if (settings) {
      matchedResources.push(RESOURCE_NAMES.settings);
    } else {
      await db.WinerySettings.create({
        wineryId: config.wineryId,
        ...DESIRED_SETTINGS
      }, { transaction });
      createdResources.push(RESOURCE_NAMES.settings);
    }

    if (integrationConfig) {
      matchedResources.push(RESOURCE_NAMES.integrationConfig);
    } else {
      await db.WineryIntegrationConfig.create({
        wineryId: config.wineryId,
        ...DESIRED_INTEGRATION_CONFIG,
        channelsEnabled: [],
        providerConnections: {}
      }, { transaction });
      createdResources.push(RESOURCE_NAMES.integrationConfig);
    }

    if (billingProfile) {
      matchedResources.push(RESOURCE_NAMES.billingProfile);
    } else {
      await db.WineryBillingProfile.create({
        wineryId: config.wineryId,
        ...DESIRED_BILLING_PROFILE,
        meteringStartedAt: new Date()
      }, { transaction });
      createdResources.push(RESOURCE_NAMES.billingProfile);
    }

    if (userByUid) {
      matchedResources.push(RESOURCE_NAMES.admin);
    } else {
      await db.User.create({
        firebaseUid: config.adminFirebaseUid,
        email: config.adminEmail,
        displayName: config.adminDisplayName,
        role: 'admin',
        wineryId: config.wineryId,
        isActive: true
      }, { transaction });
      createdResources.push(RESOURCE_NAMES.admin);
    }

    return { createdResources, matchedResources };
  });
}

module.exports = {
  DESIRED_BILLING_PROFILE,
  DESIRED_INTEGRATION_CONFIG,
  DESIRED_SETTINGS,
  assertFirebaseAdminIdentity,
  bootstrapPilot,
  lookupFirebaseAdminIdentity,
  matchesAdmin,
  matchesBillingProfile,
  matchesIntegrationConfig,
  matchesSettings,
  matchesWinery,
  parsePilotBootstrapConfig
};
