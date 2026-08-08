require('dotenv').config();
require('./config/telemetry');
const app = require('./app');
// Require models to trigger init/association
const db = require('./models');
const logger = require('./config/logger');
const taskDeadlineService = require('./services/taskDeadline.service');
const emailSyncService = require('./services/emailSync.service');
const operationalIntelligenceScheduler = require('./services/operationalIntelligenceScheduler.service');
const runtimeState = require('./services/runtimeState.service');
const { runStartupSafetyChecks } = require('./services/startupSafety.service');
const { startUsageSnapshotScheduler } = require('./services/usageTracking.service');

const PORT = process.env.PORT || 4000;

function stopScheduler(handle) {
  if (!handle) return;
  if (typeof handle.stop === 'function') {
    handle.stop();
  } else {
    clearInterval(handle);
  }
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

function registerGracefulShutdown({ server, schedulerHandles }) {
  let shuttingDown = false;
  const timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000;

  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    runtimeState.markDraining();
    logger.info('Graceful shutdown started.', { signal });

    for (const handle of schedulerHandles) stopScheduler(handle);

    const forceTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out.');
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      process.exit(1);
    }, timeoutMs);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    try {
      await closeHttpServer(server);
      await db.sequelize.close();
      clearTimeout(forceTimer);
      logger.info('Graceful shutdown complete.');
      process.exitCode = 0;
    } catch (error) {
      clearTimeout(forceTimer);
      logger.error('Graceful shutdown failed.', {
        code: error.code || null,
        error: error.message
      });
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

async function startServer() {
  try {
    // Never accept traffic until connectivity, persistent attachment storage,
    // production configuration, and migration state have been verified.
    await runStartupSafetyChecks({ sequelize: db.sequelize });
    // Validate that models are loaded
    if (Object.keys(db).length <= 2) { // sequelize + Sequelize
      logger.warn('Warning: No models appear to be loaded. Check src/models/index.js');
    }
    logger.info('Startup safety checks passed.');

    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(PORT, () => {
        logger.info(`VinAgent API listening on port ${PORT}`);
        resolve(listener);
      });
      listener.once('error', reject);
    });

    const schedulerHandles = [
      taskDeadlineService.startDeadlineReminderScheduler(),
      emailSyncService.startEmailSyncScheduler(),
      operationalIntelligenceScheduler.startOperationalIntelligenceScheduler(),
      startUsageSnapshotScheduler()
    ];
    registerGracefulShutdown({ server, schedulerHandles });
    return server;

  } catch (err) {
    logger.error('Server startup failed.', {
      code: err.code || null,
      error: err.message
    });
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  registerGracefulShutdown,
  startServer,
  stopScheduler
};
