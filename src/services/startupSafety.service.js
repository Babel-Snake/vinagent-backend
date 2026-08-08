const { validateAttachmentStorage } = require('./attachmentStorage.service');
const { validateProductionEnvironment } = require('./deploymentEnvironment.service');
const { inspectMigrationStatus } = require('./migrationStatus.service');

class StartupSafetyError extends Error {
  constructor(message, code, cause = null) {
    super(message);
    this.name = 'StartupSafetyError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

async function runStartupSafetyChecks({
  sequelize,
  env = process.env,
  environment = env.NODE_ENV,
  validateStorage = validateAttachmentStorage,
  inspectMigrations = inspectMigrationStatus
}) {
  try {
    await sequelize.authenticate();
  } catch (error) {
    throw new StartupSafetyError('Database connectivity check failed.', 'DATABASE_UNAVAILABLE', error);
  }

  if (environment !== 'production') {
    return { ready: true, checks: { database: 'pass' } };
  }

  const environmentStatus = validateProductionEnvironment(env);
  if (!environmentStatus.ready) {
    throw new StartupSafetyError(
      'Production environment validation failed.',
      'PRODUCTION_CONFIGURATION_INVALID'
    );
  }

  try {
    await validateStorage({ env, environment });
  } catch (error) {
    throw new StartupSafetyError('Attachment storage validation failed.', error.code || 'ATTACHMENT_STORAGE_INVALID', error);
  }

  let migrationStatus;
  try {
    migrationStatus = await inspectMigrations({ sequelize });
  } catch (error) {
    throw new StartupSafetyError('Migration status could not be verified.', 'MIGRATION_STATUS_UNAVAILABLE', error);
  }

  if (!migrationStatus.ready) {
    throw new StartupSafetyError(
      'Database migrations are not current.',
      'DATABASE_MIGRATIONS_NOT_CURRENT'
    );
  }

  return {
    ready: true,
    checks: {
      database: 'pass',
      environment: 'pass',
      attachmentStorage: 'pass',
      migrations: 'pass'
    },
    migrationStatus
  };
}

module.exports = {
  StartupSafetyError,
  runStartupSafetyChecks
};
