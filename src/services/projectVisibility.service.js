const {
  ProjectArea,
  ProjectParticipant
} = require('../models');
const operationalAreaService = require('./operationalArea.service');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

function linkedAreaIds(project) {
  const value = plain(project) || {};
  if (Array.isArray(value.AreaLinks)) return value.AreaLinks.map(link => Number(link.areaId));
  if (Array.isArray(value.OperationalAreas)) return value.OperationalAreas.map(area => Number(area.id));
  return [];
}

async function getProjectAreaIds(projectId, wineryId, transaction = null) {
  const rows = await ProjectArea.findAll({
    where: { projectId, wineryId },
    attributes: ['areaId'],
    transaction
  });
  return rows.map(row => Number(row.areaId));
}

async function isParticipant(projectId, userId, wineryId, transaction = null) {
  if (!userId) return false;
  return Boolean(await ProjectParticipant.findOne({
    where: { projectId, userId, wineryId },
    attributes: ['projectId'],
    transaction
  }));
}

async function canViewProject(project, { wineryId, userId, userRole, transaction = null }) {
  const value = plain(project);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (
    Number(value.ownerUserId) === Number(userId)
    || Number(value.leadUserId) === Number(userId)
    || Number(value.createdBy) === Number(userId)
    || await isParticipant(value.id, userId, wineryId, transaction)
  ) return true;
  if (value.areaScope !== 'AREAS') return true;

  const projectAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = projectAreaIds.length > 0
    ? projectAreaIds
    : await getProjectAreaIds(value.id, wineryId, transaction);
  if (resolvedAreaIds.length === 0) return false;
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return resolvedAreaIds.some(areaId => areaIds.includes(areaId));
}

async function canGovernProject(project, { wineryId, userId, userRole, transaction = null }) {
  const value = plain(project);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (value.areaScope !== 'AREAS') return false;

  const projectAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = projectAreaIds.length > 0
    ? projectAreaIds
    : await getProjectAreaIds(value.id, wineryId, transaction);
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return resolvedAreaIds.length > 0 && resolvedAreaIds.every(areaId => managedAreaIds.includes(areaId));
}

async function canManageProject(project, context) {
  const value = plain(project);
  if (!value || Number(value.wineryId) !== Number(context.wineryId)) return false;
  if (
    Number(value.leadUserId) === Number(context.userId)
    && !['COMPLETED', 'CANCELLED'].includes(value.status)
  ) return true;
  return canGovernProject(project, context);
}

async function getProjectPermissions(project, context) {
  const canView = await canViewProject(project, context);
  const canGovern = canView && await canGovernProject(project, context);
  const isLead = canView && Number(plain(project).leadUserId) === Number(context.userId);
  const isTerminal = ['COMPLETED', 'CANCELLED'].includes(plain(project).status);
  const canManage = canGovern || (isLead && !isTerminal);
  return {
    canView,
    canManage,
    canGovern,
    isLead,
    canDelegateTasks: canManage && !isTerminal,
    canChangeLeadership: canGovern,
    canChangeScope: canGovern,
    canComplete: canGovern,
    canCancel: canGovern
  };
}

async function assertCanViewProject(project, context) {
  if (!(await canViewProject(project, context))) throw new NotFoundError('Project not found');
}

async function assertCanManageProject(project, context) {
  if (!(await canManageProject(project, context))) {
    throw new ForbiddenError('You do not have permission to manage this Project.');
  }
}

async function assertCanGovernProject(project, context) {
  if (!(await canGovernProject(project, context))) {
    throw new ForbiddenError('Only an accountable Project owner or authorised manager can change Project governance.');
  }
}

module.exports = {
  linkedAreaIds,
  getProjectAreaIds,
  canViewProject,
  canGovernProject,
  canManageProject,
  getProjectPermissions,
  assertCanViewProject,
  assertCanManageProject,
  assertCanGovernProject
};
