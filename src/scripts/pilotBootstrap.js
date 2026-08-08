'use strict';

require('dotenv').config();
const {
  bootstrapPilot,
  lookupFirebaseAdminIdentity,
  parsePilotBootstrapConfig
} = require('../services/pilotBootstrap.service');

async function main({
  env = process.env,
  loadDb = () => require('../models'),
  loadFirebaseAuth = () => require('../config/firebase').auth(),
  stdout = process.stdout
} = {}) {
  let db;
  try {
    const config = parsePilotBootstrapConfig(env);
    const firebaseIdentity = await lookupFirebaseAdminIdentity({
      firebaseAuth: loadFirebaseAuth(),
      config
    });
    db = loadDb();
    const result = await bootstrapPilot({ db, config, firebaseIdentity });
    stdout.write(`${JSON.stringify({
      status: 'configured',
      action: 'pilot_bootstrap',
      createdResources: result.createdResources,
      matchedResources: result.matchedResources
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stdout.write(`${JSON.stringify({
      status: 'failed',
      action: 'pilot_bootstrap',
      code: error.code || 'PILOT_BOOTSTRAP_FAILED'
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
