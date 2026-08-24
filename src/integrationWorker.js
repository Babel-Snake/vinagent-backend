require('dotenv').config();
require('./config/telemetry');
const db = require('./models');
const logger = require('./config/logger');
const runtimeState = require('./services/runtimeState.service');
const { runStartupSafetyChecks } = require('./services/startupSafety.service');
const { startIntegrationWorkerLoop, getIntegrationWorkerConfig } = require('./services/integrationWorker.service');
const { createConfiguredIntegrationJobHandlerRegistry } = require('./services/integrationJobHandlers.service');

function registerWorkerShutdown({
  worker,
  sequelize = db.sequelize,
  processRef = process,
  timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000
}) {
  let shuttingDown = false;
  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    runtimeState.markDraining();
    logger.info('Integration worker shutdown started.', { signal });
    let timeout;
    try {
      if (worker) {
        await Promise.race([
          worker.stop(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              const error = new Error('Integration worker shutdown timed out.');
              error.code = 'WORKER_SHUTDOWN_TIMEOUT';
              reject(error);
            }, timeoutMs);
            if (typeof timeout.unref === 'function') timeout.unref();
          })
        ]);
      }
      clearTimeout(timeout);
      await sequelize.close();
      logger.info('Integration worker shutdown complete.');
      processRef.exitCode = 0;
    } catch (error) {
      clearTimeout(timeout);
      logger.error('Integration worker shutdown failed.', { code: error.code || null, error: error.message });
      processRef.exitCode = 1;
    }
  };
  processRef.once('SIGTERM', () => shutdown('SIGTERM'));
  processRef.once('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

async function startIntegrationWorkerProcess({ env = process.env, sequelize = db.sequelize, processRef = process } = {}) {
  const config = getIntegrationWorkerConfig(env);
  if (!config.enabled) {
    logger.info('Integration worker process not enabled.');
    return null;
  }
  await runStartupSafetyChecks({ sequelize, env, environment: env.NODE_ENV });
  const handlerRegistry = createConfiguredIntegrationJobHandlerRegistry({ env });
  const worker = startIntegrationWorkerLoop({ config, handlerRegistry });
  registerWorkerShutdown({ worker, sequelize, processRef });
  return worker;
}

if (require.main === module) {
  startIntegrationWorkerProcess().catch(error => {
    logger.error('Integration worker startup failed.', { code: error.code || null, error: error.message });
    process.exitCode = 1;
  });
}

module.exports = {
  registerWorkerShutdown,
  startIntegrationWorkerProcess
};
