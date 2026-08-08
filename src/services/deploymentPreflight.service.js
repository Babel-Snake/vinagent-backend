const { validateAttachmentStorage } = require('./attachmentStorage.service');
const { validateProductionEnvironment } = require('./deploymentEnvironment.service');
const { inspectMigrationStatus } = require('./migrationStatus.service');
const { assessProviderCapabilities } = require('./providerCapability.service');

function failedCheck(code, details = {}) {
  return { status: 'fail', code, ...details };
}

function passedCheck(code, details = {}) {
  return { status: 'pass', code, ...details };
}

function environmentPreflight(env = process.env) {
  const result = validateProductionEnvironment(env);
  return result.ready
    ? passedCheck('PRODUCTION_ENVIRONMENT_VALID')
    : failedCheck('PRODUCTION_ENVIRONMENT_INVALID', { issues: result.issues });
}

async function runDeploymentPreflight({
  db,
  env = process.env,
  inspectMigrations = inspectMigrationStatus,
  validateStorage = validateAttachmentStorage,
  assessProviders = assessProviderCapabilities
}) {
  const checks = { environment: environmentPreflight(env) };
  if (checks.environment.status === 'fail') {
    return { status: 'not_ready', checks };
  }

  try {
    await db.sequelize.authenticate();
    checks.database = passedCheck('DATABASE_REACHABLE');
  } catch (error) {
    checks.database = failedCheck('DATABASE_UNAVAILABLE');
    return { status: 'not_ready', checks };
  }

  try {
    const migrationStatus = await inspectMigrations({ sequelize: db.sequelize });
    checks.migrations = migrationStatus.ready
      ? passedCheck('DATABASE_MIGRATIONS_CURRENT', {
        expectedCount: migrationStatus.expectedCount,
        appliedCount: migrationStatus.appliedCount
      })
      : failedCheck('DATABASE_MIGRATIONS_NOT_CURRENT', {
        expectedCount: migrationStatus.expectedCount,
        appliedCount: migrationStatus.appliedCount,
        pendingCount: migrationStatus.pendingCount,
        unknownAppliedCount: migrationStatus.unknownAppliedCount
      });
  } catch (error) {
    checks.migrations = failedCheck('MIGRATION_STATUS_UNAVAILABLE');
  }

  try {
    await validateStorage({ env, environment: 'production' });
    checks.attachmentStorage = passedCheck('ATTACHMENT_STORAGE_READY');
  } catch (error) {
    checks.attachmentStorage = failedCheck(error.code || 'ATTACHMENT_STORAGE_INVALID');
  }

  const wineryId = Number(env.DEPLOYMENT_WINERY_ID);
  const winery = await db.Winery.findByPk(wineryId, { attributes: ['id'] });
  if (!winery) {
    checks.deploymentWinery = failedCheck('DEPLOYMENT_WINERY_NOT_FOUND');
  } else {
    checks.deploymentWinery = passedCheck('DEPLOYMENT_WINERY_FOUND');

    try {
      const admins = await db.User.findAll({
        where: { wineryId, role: 'admin', isActive: true },
        attributes: ['firebaseUid']
      });
      const hasBoundAdmin = admins.some(admin => String(admin.firebaseUid || '').trim().length > 0);
      checks.deploymentAdmin = hasBoundAdmin
        ? passedCheck('DEPLOYMENT_ADMIN_FOUND')
        : failedCheck('DEPLOYMENT_ADMIN_NOT_FOUND');
    } catch (error) {
      checks.deploymentAdmin = failedCheck('DEPLOYMENT_ADMIN_STATUS_UNAVAILABLE');
    }

    try {
      const billingProfile = await db.WineryBillingProfile.findOne({
        where: { wineryId },
        attributes: ['lifecycleStatus', 'planCode', 'billingProvider', 'meteringStartedAt']
      });
      checks.usageMetering = billingProfile
        && String(billingProfile.lifecycleStatus || '').trim()
        && String(billingProfile.planCode || '').trim()
        && String(billingProfile.billingProvider || '').trim()
        && billingProfile.meteringStartedAt
        ? passedCheck('USAGE_METERING_PROFILE_READY')
        : failedCheck('USAGE_METERING_PROFILE_NOT_READY');
    } catch (error) {
      checks.usageMetering = failedCheck('USAGE_METERING_PROFILE_UNAVAILABLE');
    }

    const [integrationConfig, winerySettings, areaIntegrationConfigs] = await Promise.all([
      db.WineryIntegrationConfig.findOne({ where: { wineryId } }),
      db.WinerySettings.findOne({ where: { wineryId } }),
      db.OperationalAreaIntegrationConfig.findAll({
        where: { wineryId },
        attributes: ['providerConnections']
      })
    ]);
    const providerStatus = assessProviders({
      integrationConfig,
      winerySettings,
      areaIntegrationConfigs,
      env
    });
    checks.providers = providerStatus.ready
      ? passedCheck('ENABLED_PROVIDER_CAPABILITIES_READY', { capabilities: providerStatus.capabilities })
      : failedCheck('ENABLED_PROVIDER_CAPABILITIES_NOT_READY', { capabilities: providerStatus.capabilities });
  }

  const ready = Object.values(checks).every(check => check.status === 'pass');
  return { status: ready ? 'ready' : 'not_ready', checks };
}

module.exports = {
  environmentPreflight,
  runDeploymentPreflight
};
