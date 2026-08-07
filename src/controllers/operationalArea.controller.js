const operationalAreaService = require('../services/operationalArea.service');
const { validate, operationalAreaCreateSchema, operationalAreaUpdateSchema, areaMembershipReplaceSchema } = require('../utils/validation');

async function listAreas(req, res, next) {
  try {
    const areas = await operationalAreaService.listAreas({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      includeInactive: req.query.includeInactive === 'true'
    });
    res.json({ areas });
  } catch (err) { next(err); }
}

async function createArea(req, res, next) {
  try {
    const area = await operationalAreaService.createArea({
      wineryId: req.user.wineryId,
      userRole: req.user.role,
      data: validate(operationalAreaCreateSchema, req.body)
    });
    res.status(201).json({ area });
  } catch (err) { next(err); }
}

async function updateArea(req, res, next) {
  try {
    const area = await operationalAreaService.updateArea({
      areaId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userRole: req.user.role,
      data: validate(operationalAreaUpdateSchema, req.body)
    });
    res.json({ area });
  } catch (err) { next(err); }
}

async function replaceMemberships(req, res, next) {
  try {
    const data = validate(areaMembershipReplaceSchema, req.body);
    const memberships = await operationalAreaService.replaceUserMemberships({
      targetUserId: Number(req.params.userId),
      wineryId: req.user.wineryId,
      userRole: req.user.role,
      memberships: data.memberships
    });
    res.json({ memberships });
  } catch (err) { next(err); }
}

module.exports = { listAreas, createArea, updateArea, replaceMemberships };
