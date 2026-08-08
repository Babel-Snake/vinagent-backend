'use strict';

require('dotenv').config();
const {
  disableUnsupportedPilotModules,
  parseDeploymentWineryId
} = require('../services/pilotModuleConfiguration.service');

async function main({
  env = process.env,
  loadDb = () => require('../models'),
  stdout = process.stdout
} = {}) {
  let db;
  try {
    const deploymentWineryId = parseDeploymentWineryId(env.DEPLOYMENT_WINERY_ID);
    db = loadDb();
    const result = await disableUnsupportedPilotModules({ db, deploymentWineryId });
    stdout.write(`${JSON.stringify({
      status: 'configured',
      action: 'disable_unsupported_pilot_modules',
      changed: result.changed,
      beforeCapabilities: result.beforeCapabilities,
      afterCapabilities: result.afterCapabilities
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stdout.write(`${JSON.stringify({
      status: 'failed',
      action: 'disable_unsupported_pilot_modules',
      code: error.code || 'PILOT_CONFIGURATION_FAILED'
    }, null, 2)}\n`);
    return 1;
  } finally {
    if (db?.sequelize) await db.sequelize.close().catch(() => {});
  }
}

if (require.main === module) {
  main().then(exitCode => {
    process.exitCode = exitCode;
  });
}

module.exports = { main };
