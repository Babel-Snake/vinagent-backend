const { OperationalArea } = require('../models');
const operationalAreaService = require('./operationalArea.service');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

async function getConfigurationAccess({ wineryId, userId, userRole, transaction = null }) {
  const isGlobalManager = operationalAreaService.isGlobalManager(userRole);
  const access = userId
    ? await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction })
    : { areaIds: [], managedAreaIds: [] };

  return {
    isGlobalManager,
    canRead: isGlobalManager || access.managedAreaIds.length > 0,
    areaIds: access.areaIds,
    managedAreaIds: access.managedAreaIds
  };
}

async function assertCanRead(context) {
  const access = await getConfigurationAccess(context);
  if (!access.canRead) throw new ForbiddenError('Winery configuration is available to winery and area managers.');
  return access;
}

async function assertCanManageArea({ areaId, wineryId, userId, userRole, transaction = null }) {
  const area = await OperationalArea.findOne({
    where: { id: areaId, wineryId, isActive: true },
    transaction
  });
  if (!area) throw new NotFoundError('Operational area not found');

  const access = await getConfigurationAccess({ wineryId, userId, userRole, transaction });
  if (!access.isGlobalManager && !access.managedAreaIds.includes(Number(area.id))) {
    throw new ForbiddenError('You can only update configuration for operational areas you manage.');
  }
  return { area, access };
}

module.exports = {
  getConfigurationAccess,
  assertCanRead,
  assertCanManageArea
};
