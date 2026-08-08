'use strict';

require('dotenv').config();
const { environmentPreflight, runDeploymentPreflight } = require('../services/deploymentPreflight.service');

async function main() {
  const environment = environmentPreflight(process.env);
  if (environment.status === 'fail') {
    process.stdout.write(`${JSON.stringify({ status: 'not_ready', checks: { environment } }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  // Models are loaded only after the static environment check. This avoids a
  // partial application boot and keeps the command read-only: no migrations,
  // provider calls, messages, or storage probes are written.
  const db = require('../models');
  try {
    const result = await runDeploymentPreflight({ db, env: process.env });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === 'ready' ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'not_ready',
      checks: { preflight: failedResult('PREFLIGHT_CHECK_FAILED') }
    }, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close().catch(() => {});
  }
}

function failedResult(code) {
  return { status: 'fail', code };
}

if (require.main === module) {
  main();
}

module.exports = { main };
