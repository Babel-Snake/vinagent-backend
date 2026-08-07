const { Op } = require('sequelize');
const {
  OperationalArea,
  User,
  UserAreaMembership
} = require('../models');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');

const GLOBAL_MANAGER_ROLES = new Set(['manager', 'admin']);
const AREA_SCOPES = new Set(['ORGANISATION', 'AREAS']);

function isGlobalManager(userRole) {
  return GLOBAL_MANAGER_ROLES.has(userRole);
}

function serializeMembership(membership) {
  const plain = membership.toJSON ? membership.toJSON() : membership;
  return {
    id: plain.id,
    userId: plain.userId,
    areaId: plain.areaId,
    membershipRole: plain.membershipRole,
    isPrimary: Boolean(plain.isPrimary),
    User: plain.User || undefined
  };
}

function serializeArea(area, includeMemberships = false) {
  const plain = area.toJSON ? area.toJSON() : area;
  const result = {
    id: plain.id,
    wineryId: plain.wineryId,
    name: plain.name,
    description: plain.description,
    isActive: Boolean(plain.isActive),
    sortOrder: plain.sortOrder,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt
  };
  if (includeMemberships) {
    result.Memberships = (plain.Memberships || []).map(serializeMembership);
  }
  return result;
}

async function listAreas({ wineryId, userId, userRole, includeInactive = false }) {
  const includeMemberships = isGlobalManager(userRole);
  const where = { wineryId };
  if (!includeInactive || !includeMemberships) where.isActive = true;

  const include = includeMemberships ? [{
    model: UserAreaMembership,
    as: 'Memberships',
    include: [{ model: User, as: 'User', attributes: ['id', 'displayName', 'email', 'role', 'isActive'] }],
    required: false
  }] : [];

  const areas = await OperationalArea.findAll({
    where,
    include,
    order: [['sortOrder', 'ASC'], ['name', 'ASC'], ['id', 'ASC']]
  });
  const serialized = areas.map(area => serializeArea(area, includeMemberships));
  const ownMemberships = userId ? await getUserMemberships({ userId, wineryId }) : [];
  const ownByArea = new Map(ownMemberships.map(membership => [Number(membership.areaId), membership]));
  return serialized.map(area => ({ ...area, myMembership: ownByArea.get(Number(area.id)) || null }));
}

async function createArea({ wineryId, userRole, data }) {
  if (!isGlobalManager(userRole)) throw new ForbiddenError('Only winery managers can create operational areas.');
  const name = String(data.name || '').trim();
  if (!name) throw new ValidationError('Area name is required.');

  const existing = await OperationalArea.findOne({
    where: { wineryId, name: { [Op.eq]: name } }
  });
  if (existing) throw new ValidationError('An operational area with this name already exists.');

  const area = await OperationalArea.create({
    wineryId,
    name,
    description: data.description || null,
    isActive: data.isActive !== false,
    sortOrder: Number.isInteger(data.sortOrder) ? data.sortOrder : 0
  });
  return serializeArea(area);
}

async function updateArea({ areaId, wineryId, userRole, data }) {
  if (!isGlobalManager(userRole)) throw new ForbiddenError('Only winery managers can update operational areas.');
  const area = await OperationalArea.findOne({ where: { id: areaId, wineryId } });
  if (!area) throw new NotFoundError('Operational area not found');

  if (data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw new ValidationError('Area name is required.');
    const duplicate = await OperationalArea.findOne({
      where: { wineryId, name, id: { [Op.ne]: area.id } }
    });
    if (duplicate) throw new ValidationError('An operational area with this name already exists.');
    area.name = name;
  }
  if (data.description !== undefined) area.description = data.description || null;
  if (data.isActive !== undefined) area.isActive = Boolean(data.isActive);
  if (data.sortOrder !== undefined) area.sortOrder = data.sortOrder;
  await area.save();
  return serializeArea(area);
}

function normalizeMemberships(memberships = []) {
  const seen = new Set();
  const normalized = memberships.map(item => {
    const areaId = Number(item.areaId);
    if (!Number.isInteger(areaId) || areaId < 1 || seen.has(areaId)) {
      throw new ValidationError('Area memberships must contain unique valid area IDs.');
    }
    seen.add(areaId);
    return {
      areaId,
      membershipRole: item.membershipRole === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      isPrimary: Boolean(item.isPrimary)
    };
  });
  if (normalized.filter(item => item.isPrimary).length > 1) {
    throw new ValidationError('A user can only have one primary operational area.');
  }
  return normalized;
}

async function replaceUserMemberships({ targetUserId, wineryId, userRole, memberships }) {
  if (!isGlobalManager(userRole)) throw new ForbiddenError('Only winery managers can manage area memberships.');
  const user = await User.findOne({ where: { id: targetUserId, wineryId } });
  if (!user) throw new NotFoundError('Staff member not found');
  const normalized = normalizeMemberships(memberships);

  if (normalized.length > 0) {
    const areas = await OperationalArea.findAll({
      where: { id: { [Op.in]: normalized.map(item => item.areaId) }, wineryId, isActive: true },
      attributes: ['id']
    });
    if (areas.length !== normalized.length) throw new ValidationError('One or more operational areas are invalid or inactive.');
  }

  const transaction = await UserAreaMembership.sequelize.transaction();
  try {
    await UserAreaMembership.destroy({ where: { userId: user.id, wineryId }, transaction });
    if (normalized.length > 0) {
      await UserAreaMembership.bulkCreate(normalized.map(item => ({
        ...item,
        userId: user.id,
        wineryId
      })), { transaction });
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  return getUserMemberships({ userId: user.id, wineryId });
}

async function getUserMemberships({ userId, wineryId, transaction = null }) {
  return UserAreaMembership.findAll({
    where: { userId, wineryId },
    include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive', 'sortOrder'] }],
    order: [['isPrimary', 'DESC'], ['areaId', 'ASC']],
    transaction
  }).then(rows => rows.map(serializeMembership));
}

async function getUserAreaAccess({ userId, wineryId, transaction = null }) {
  const memberships = await UserAreaMembership.findAll({
    where: { userId, wineryId },
    attributes: ['areaId', 'membershipRole'],
    transaction
  });
  return {
    areaIds: memberships.map(item => Number(item.areaId)),
    managedAreaIds: memberships
      .filter(item => item.membershipRole === 'MANAGER')
      .map(item => Number(item.areaId))
  };
}

async function validateAreaPlacement({
  wineryId,
  userId,
  userRole,
  areaScope = 'ORGANISATION',
  primaryAreaId = null,
  linkedAreaIds = [],
  requireManage = false,
  requireAccess = false,
  transaction = null
}) {
  const normalizedScope = String(areaScope || 'ORGANISATION').toUpperCase();
  if (!AREA_SCOPES.has(normalizedScope)) throw new ValidationError('Invalid area scope.');
  if (normalizedScope === 'ORGANISATION') {
    if (primaryAreaId || linkedAreaIds.length > 0) {
      throw new ValidationError('Organisation-wide records cannot also target operational areas.');
    }
    if (requireManage && !isGlobalManager(userRole)) {
      throw new ForbiddenError('Only winery managers can create organisation-wide records.');
    }
    return { areaScope: normalizedScope, primaryAreaId: null, areaIds: [] };
  }

  const primaryId = primaryAreaId ? Number(primaryAreaId) : null;
  const areaIds = [...new Set([
    ...(primaryId ? [primaryId] : []),
    ...(linkedAreaIds || []).map(Number)
  ].filter(id => Number.isInteger(id) && id > 0))];
  if (areaIds.length === 0) throw new ValidationError('Choose at least one operational area.');

  const areas = await OperationalArea.findAll({
    where: { id: { [Op.in]: areaIds }, wineryId, isActive: true },
    attributes: ['id'],
    transaction
  });
  if (areas.length !== areaIds.length) throw new ValidationError('One or more operational areas are invalid or inactive.');

  if (requireAccess && !isGlobalManager(userRole)) {
    const { areaIds: accessibleAreaIds } = await getUserAreaAccess({ userId, wineryId, transaction });
    if (!areaIds.every(id => accessibleAreaIds.includes(id))) {
      throw new ForbiddenError('You can only place records in operational areas you belong to.');
    }
  }

  if (requireManage && !isGlobalManager(userRole)) {
    const { managedAreaIds } = await getUserAreaAccess({ userId, wineryId, transaction });
    if (!areaIds.every(id => managedAreaIds.includes(id))) {
      throw new ForbiddenError('You can only manage records for operational areas you manage.');
    }
  }

  return { areaScope: normalizedScope, primaryAreaId: primaryId, areaIds };
}

module.exports = {
  AREA_SCOPES,
  isGlobalManager,
  listAreas,
  createArea,
  updateArea,
  replaceUserMemberships,
  getUserMemberships,
  getUserAreaAccess,
  validateAreaPlacement
};
