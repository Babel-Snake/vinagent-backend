const { validateAttachmentStorage } = require('./attachmentStorage.service');
const { validateProductionEnvironment } = require('./deploymentEnvironment.service');
const { inspectMigrationStatus } = require('./migrationStatus.service');
const runtimeState = require('./runtimeState.service');

function safeFailure(checks, name, code) {
  checks[name] = { status: 'fail', code };
}

async function checkOperationalReadiness({
  sequelize = null,
  env = process.env,
  environment = env.NODE_ENV,
  validateStorage = validateAttachmentStorage,
  inspectMigrations = inspectMigrationStatus,
  isDraining = runtimeState.isDraining
} = {}) {
  const checks = {};

  if (isDraining()) {
    safeFailure(checks, 'runtime', 'SERVER_DRAINING');
    return { ready: false, checks };
  }

  if (environment === 'production') {
    const environmentStatus = validateProductionEnvironment(env);
    if (environmentStatus.ready) {
      checks.environment = { status: 'pass' };
    } else {
      safeFailure(checks, 'environment', 'PRODUCTION_CONFIGURATION_INVALID');
    }
  }

  const connection = sequelize || require('../models').sequelize;
  try {
    await connection.authenticate();
    checks.database = { status: 'pass' };
  } catch (error) {
    safeFailure(checks, 'database', 'DATABASE_UNAVAILABLE');
  }

  if (environment === 'production') {
    try {
      await validateStorage({ env, environment });
      checks.attachmentStorage = { status: 'pass' };
    } catch (error) {
      safeFailure(checks, 'attachmentStorage', error.code || 'ATTACHMENT_STORAGE_INVALID');
    }

    if (checks.database.status === 'pass') {
      try {
        const migrationStatus = await inspectMigrations({ sequelize: connection });
        if (migrationStatus.ready) {
          checks.migrations = { status: 'pass' };
        } else {
          safeFailure(checks, 'migrations', 'DATABASE_MIGRATIONS_NOT_CURRENT');
        }
      } catch (error) {
        safeFailure(checks, 'migrations', 'MIGRATION_STATUS_UNAVAILABLE');
      }
    } else {
      checks.migrations = { status: 'blocked', code: 'DATABASE_UNAVAILABLE' };
    }
  }

  return {
    ready: Object.values(checks).every(check => check.status === 'pass'),
    checks
  };
}

module.exports = {
  checkOperationalReadiness
};
