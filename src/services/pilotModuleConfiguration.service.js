const UNSUPPORTED_MODULE_FLAGS = Object.freeze([
  'enableBookingModule',
  'enableWineClubModule',
  'enableOrdersModule'
]);

function configurationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseDeploymentWineryId(rawValue) {
  const wineryId = Number(String(rawValue || '').trim());
  if (!Number.isInteger(wineryId) || wineryId < 1) {
    throw configurationError('DEPLOYMENT_WINERY_ID_INVALID');
  }
  return wineryId;
}

function enabledUnsupportedCapabilities(settings) {
  const capabilities = [];
  if (settings?.enableBookingModule) capabilities.push('booking_execution');
  if (settings?.enableWineClubModule || settings?.enableOrdersModule) {
    capabilities.push('crm_execution');
  }
  return capabilities;
}

async function disableUnsupportedPilotModules({ db, deploymentWineryId }) {
  const wineryId = parseDeploymentWineryId(deploymentWineryId);

  return db.sequelize.transaction(async transaction => {
    const lock = transaction?.LOCK?.UPDATE;
    const winery = await db.Winery.findByPk(wineryId, {
      attributes: ['id'],
      transaction,
      ...(lock ? { lock } : {})
    });
    if (!winery) throw configurationError('DEPLOYMENT_WINERY_NOT_FOUND');

    const settings = await db.WinerySettings.findOne({
      where: { wineryId },
      transaction,
      ...(lock ? { lock } : {})
    });
    if (!settings) throw configurationError('WINERY_SETTINGS_NOT_FOUND');

    const beforeCapabilities = enabledUnsupportedCapabilities(settings);
    const updates = {};
    for (const field of UNSUPPORTED_MODULE_FLAGS) {
      if (settings[field] !== false) updates[field] = false;
    }

    if (Object.keys(updates).length > 0) {
      await settings.update(updates, { transaction });
    }

    return {
      beforeCapabilities,
      afterCapabilities: [],
      changedCapabilities: beforeCapabilities,
      changed: Object.keys(updates).length > 0
    };
  });
}

module.exports = {
  UNSUPPORTED_MODULE_FLAGS,
  disableUnsupportedPilotModules,
  enabledUnsupportedCapabilities,
  parseDeploymentWineryId
};
