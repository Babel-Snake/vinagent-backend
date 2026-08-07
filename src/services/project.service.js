const { Op } = require('sequelize');
const {
  Notification,
  OperationalArea,
  Project,
  ProjectArea,
  ProjectAuditEvent,
  ProjectItem,
  ProjectParticipant,
  ProjectTaskDependency,
  Task,
  User,
  UserAreaMembership
} = require('../models');
const operationalAreaService = require('./operationalArea.service');
const projectItemResolver = require('./projectItemResolver.service');
const projectSummaryService = require('./projectSummary.service');
const projectVisibility = require('./projectVisibility.service');
const taskCreationService = require('./taskCreation.service');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');

const USER_ATTRIBUTES = ['id', 'displayName', 'email', 'role', 'isActive'];

function projectIncludes() {
  return [
    { model: User, as: 'Owner', attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'Lead', attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'LeadGrantor', attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'Creator', attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'Updater', attributes: USER_ATTRIBUTES, required: false },
    {
      model: ProjectArea,
      as: 'AreaLinks',
      include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive', 'sortOrder'] }],
      required: false
    },
    {
      model: ProjectParticipant,
      as: 'Participants',
      include: [{ model: User, as: 'User', attributes: USER_ATTRIBUTES }],
      required: false
    }
  ];
}

function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

function snapshot(project) {
  const value = plain(project) || {};
  const areaLinks = value.AreaLinks || [];
  const primaryArea = areaLinks.find(link => link.relationshipType === 'PRIMARY');
  return {
    id: value.id,
    title: value.title,
    intendedOutcome: value.intendedOutcome,
    businessContext: value.businessContext,
    status: value.status,
    areaScope: value.areaScope,
    primaryAreaId: primaryArea?.areaId || null,
    areaIds: areaLinks.map(link => Number(link.areaId)).sort((left, right) => left - right),
    ownerUserId: value.ownerUserId,
    leadUserId: value.leadUserId,
    leadGrantedByUserId: value.leadGrantedByUserId,
    leadGrantedAt: value.leadGrantedAt,
    plannedStartAt: value.plannedStartAt,
    targetEndAt: value.targetEndAt,
    actualCompletedAt: value.actualCompletedAt,
    riskReason: value.riskReason,
    riskReviewAt: value.riskReviewAt,
    completionReason: value.completionReason
  };
}

async function logProjectAudit({
  projectId,
  wineryId,
  actorUserId,
  eventType,
  beforeSnapshot = null,
  afterSnapshot = null,
  metadata = null,
  transaction = null
}) {
  return ProjectAuditEvent.create({
    projectId,
    wineryId,
    actorUserId: actorUserId || null,
    eventType,
    beforeSnapshot,
    afterSnapshot,
    metadata
  }, { transaction });
}

async function loadProject(projectId, wineryId, transaction = null) {
  return Project.findOne({
    where: { id: projectId, wineryId },
    include: projectIncludes(),
    transaction
  });
}

async function replaceAreas({ projectId, wineryId, placement, transaction }) {
  await ProjectArea.destroy({ where: { projectId, wineryId }, transaction });
  if (placement.areaScope !== 'AREAS') return;
  await ProjectArea.bulkCreate(placement.areaIds.map(areaId => ({
    projectId,
    wineryId,
    areaId,
    relationshipType: Number(areaId) === Number(placement.primaryAreaId) ? 'PRIMARY' : 'LINKED'
  })), { transaction });
}

async function validateSameWineryUsers(userIds, wineryId, transaction) {
  const uniqueIds = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
  if (uniqueIds.length === 0) return [];
  const users = await User.findAll({
    where: { id: { [Op.in]: uniqueIds }, wineryId, isActive: true },
    attributes: USER_ATTRIBUTES,
    transaction
  });
  if (users.length !== uniqueIds.length) throw new ValidationError('One or more Project users are invalid or inactive.');
  return users;
}

async function validateProjectOwner({ ownerUserId, wineryId, areaScope, areaIds, transaction }) {
  if (!ownerUserId) return null;
  const [owner] = await validateSameWineryUsers([ownerUserId], wineryId, transaction);
  if (operationalAreaService.isGlobalManager(owner.role)) return owner;
  if (areaScope !== 'AREAS') {
    throw new ValidationError('Organisation-wide Projects require a winery manager or admin as owner.');
  }
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess({
    userId: owner.id,
    wineryId,
    transaction
  });
  if (areaIds.length === 0 || !areaIds.every(areaId => managedAreaIds.includes(Number(areaId)))) {
    throw new ValidationError('The Project owner must manage every participating operational area.');
  }
  return owner;
}

async function validateProjectLead({ leadUserId, ownerUserId, wineryId, areaScope, areaIds, transaction }) {
  if (!leadUserId) return null;
  if (!ownerUserId) throw new ValidationError('A Project Lead requires an accountable owner to report to.');
  if (Number(leadUserId) === Number(ownerUserId)) {
    throw new ValidationError('The Project Lead must be different from the accountable owner.');
  }
  const [lead] = await validateSameWineryUsers([leadUserId], wineryId, transaction);
  if (areaScope === 'AREAS') {
    const { areaIds: leadAreaIds } = await operationalAreaService.getUserAreaAccess({
      userId: lead.id,
      wineryId,
      transaction
    });
    if (!areaIds.some(areaId => leadAreaIds.includes(Number(areaId)))) {
      throw new ValidationError('The Project Lead must belong to at least one participating operational area.');
    }
  }
  return lead;
}

async function assertCanCoordinateProject(project, context) {
  await projectVisibility.assertCanManageProject(project, context);
  const permissions = await projectVisibility.getProjectPermissions(project, context);
  if (permissions.isLead && ['COMPLETED', 'CANCELLED'].includes(project.status)) {
    throw new ForbiddenError('This Project is closed. Only its accountable owner or an authorised manager can change it.');
  }
  return permissions;
}

async function notifyUser({ userId, actorUserId, project, message, transaction }) {
  if (!userId || Number(userId) === Number(actorUserId)) return null;
  return Notification.create({
    userId,
    type: 'SYSTEM',
    message,
    data: {
      wineryId: project.wineryId,
      projectId: project.id,
      href: `/projects?projectId=${project.id}`
    }
  }, { transaction });
}

async function replaceParticipants({ project, userIds, actorUserId, transaction }) {
  const users = await validateSameWineryUsers(userIds, project.wineryId, transaction);
  await ProjectParticipant.destroy({ where: { projectId: project.id }, transaction });
  if (users.length === 0) return;
  await ProjectParticipant.bulkCreate(users.map(user => ({
    wineryId: project.wineryId,
    projectId: project.id,
    userId: user.id,
    participationRole: 'PARTICIPANT',
    notificationsEnabled: true,
    addedBy: actorUserId
  })), { transaction });
  for (const user of users) {
    await notifyUser({
      userId: user.id,
      actorUserId,
      project,
      message: `You were added to Project: ${project.title}`,
      transaction
    });
  }
}

function serializeBaseProject(project) {
  const value = plain(project);
  const areaLinks = value.AreaLinks || [];
  const primary = areaLinks.find(link => link.relationshipType === 'PRIMARY');
  return {
    ...value,
    primaryAreaId: primary?.areaId || null,
    areas: areaLinks.map(link => ({
      id: link.areaId,
      name: link.Area?.name || null,
      relationshipType: link.relationshipType
    }))
  };
}

async function loadDependencies(projectId, wineryId, transaction = null) {
  return ProjectTaskDependency.findAll({
    where: { projectId, wineryId },
    include: [
      { model: Task, as: 'BlockingTask', attributes: ['id', 'workflowState', 'dueAt', 'payload', 'category', 'subType'] },
      { model: Task, as: 'BlockedTask', attributes: ['id', 'workflowState', 'dueAt', 'payload', 'category', 'subType'] },
      { model: User, as: 'Creator', attributes: USER_ATTRIBUTES, required: false }
    ],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
}

async function loadItemEntries({ project, wineryId, userId, userRole, transaction = null }) {
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  const involvementContext = { userId, userRole, areaIds };
  const links = await ProjectItem.findAll({
    where: { projectId: project.id, wineryId },
    include: [{ model: User, as: 'AddedBy', attributes: USER_ATTRIBUTES, required: false }],
    order: [['sortOrder', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const allEntries = [];
  const visibleEntries = [];
  let restrictedItemCount = 0;

  for (const link of links) {
    const rawSource = await projectItemResolver.resolveProjectItemForManager({
      itemType: link.itemType,
      itemId: link.itemId,
      wineryId,
      transaction
    });
    if (!rawSource) {
      restrictedItemCount += 1;
      continue;
    }
    const rawEntry = {
      link: plain(link),
      itemType: link.itemType,
      rawSource,
      source: projectItemResolver.serializeProjectItemSource(link.itemType, rawSource, involvementContext)
    };
    allEntries.push(rawEntry);
    try {
      await projectItemResolver.resolveVisibleProjectItem({
        itemType: link.itemType,
        itemId: link.itemId,
        wineryId,
        userId,
        userRole,
        transaction
      });
      visibleEntries.push({
        ...rawEntry,
        rawSource,
        source: projectItemResolver.serializeProjectItemSource(link.itemType, rawSource, involvementContext)
      });
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      restrictedItemCount += 1;
    }
  }
  return { allEntries, visibleEntries, restrictedItemCount };
}

function serializeDependency(dependency) {
  const value = plain(dependency);
  return {
    id: value.id,
    projectId: value.projectId,
    blockingTaskId: value.blockingTaskId,
    blockedTaskId: value.blockedTaskId,
    blockingTask: value.BlockingTask ? projectItemResolver.serializeProjectItemSource('TASK', value.BlockingTask) : null,
    blockedTask: value.BlockedTask ? projectItemResolver.serializeProjectItemSource('TASK', value.BlockedTask) : null,
    Creator: value.Creator || null,
    createdAt: value.createdAt
  };
}

function buildProjectInvolvement(project, itemEntries, userId) {
  const value = plain(project) || {};
  const roles = [];

  if (Number(value.leadUserId) === Number(userId)) roles.push('LEAD');
  if (Number(value.ownerUserId) === Number(userId)) roles.push('OWNER');

  const participation = (value.Participants || []).find(
    participant => Number(participant.userId) === Number(userId)
  );
  if (participation) {
    roles.push(participation.participationRole === 'STAKEHOLDER' ? 'STAKEHOLDER' : 'PARTICIPANT');
  }

  const delegatedTaskCount = itemEntries.filter(entry => (
    entry.itemType === 'TASK'
    && entry.link.linkType === 'DELEGATED_WORK'
    && Number(plain(entry.rawSource)?.assigneeId) === Number(userId)
  )).length;
  if (delegatedTaskCount > 0) roles.push('DELEGATED_TASK_ASSIGNEE');

  return {
    roles,
    primaryRole: roles[0] || null,
    delegatedTaskCount
  };
}

async function enrichProject(project, context, { includeActivity = false } = {}) {
  const { allEntries, visibleEntries, restrictedItemCount } = await loadItemEntries({
    project,
    ...context
  });
  const dependencies = await loadDependencies(project.id, context.wineryId, context.transaction);
  const summary = projectSummaryService.buildProjectSummary({
    project,
    itemEntries: allEntries,
    dependencies
  });
  const result = {
    ...serializeBaseProject(project),
    summary,
    items: visibleEntries.map(entry => ({
      ...entry.link,
      source: entry.source
    })),
    dependencies: dependencies.map(serializeDependency),
    restrictedItemCount,
    involvement: buildProjectInvolvement(project, allEntries, context.userId),
    permissions: await projectVisibility.getProjectPermissions(project, context)
  };
  if (includeActivity) {
    result.activity = await listProjectActivity({
      projectId: project.id,
      ...context,
      skipPermissionCheck: true
    });
  }
  return result;
}

async function createProject({ wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const placement = await operationalAreaService.validateAreaPlacement({
      wineryId,
      userId,
      userRole,
      areaScope: data.areaScope,
      primaryAreaId: data.primaryAreaId,
      linkedAreaIds: data.linkedAreaIds,
      requireManage: true,
      transaction
    });
    const owner = await validateProjectOwner({
      ownerUserId: data.ownerUserId,
      wineryId,
      areaScope: placement.areaScope,
      areaIds: placement.areaIds,
      transaction
    });
    const lead = await validateProjectLead({
      leadUserId: data.leadUserId,
      ownerUserId: data.ownerUserId,
      wineryId,
      areaScope: placement.areaScope,
      areaIds: placement.areaIds,
      transaction
    });
    if (data.status === 'ACTIVE' && (!data.ownerUserId || !data.targetEndAt)) {
      throw new ValidationError('Active Projects require an owner and target date.');
    }
    if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
      throw new ValidationError('New Projects must begin as Planned, Active, or On Hold.');
    }

    const project = await Project.create({
      wineryId,
      title: data.title,
      intendedOutcome: data.intendedOutcome,
      businessContext: data.businessContext || null,
      status: data.status,
      areaScope: placement.areaScope,
      ownerUserId: data.ownerUserId || null,
      leadUserId: data.leadUserId || null,
      leadGrantedByUserId: data.leadUserId ? userId : null,
      leadGrantedAt: data.leadUserId ? new Date() : null,
      plannedStartAt: data.plannedStartAt || null,
      targetEndAt: data.targetEndAt || null,
      riskReason: data.riskReason || null,
      riskReviewAt: data.riskReviewAt || null,
      createdBy: userId,
      updatedBy: userId
    }, { transaction });
    await replaceAreas({ projectId: project.id, wineryId, placement, transaction });
    await replaceParticipants({
      project,
      userIds: data.participantUserIds,
      actorUserId: userId,
      transaction
    });
    await logProjectAudit({
      projectId: project.id,
      wineryId,
      actorUserId: userId,
      eventType: 'CREATED',
      afterSnapshot: { ...snapshot(project), areaIds: placement.areaIds },
      transaction
    });
    if (lead) {
      await logProjectAudit({
        projectId: project.id,
        wineryId,
        actorUserId: userId,
        eventType: 'LEAD_ASSIGNED',
        afterSnapshot: { leadUserId: lead.id, ownerUserId: owner.id },
        metadata: { leadUserId: lead.id, reportsToUserId: owner.id },
        transaction
      });
      await notifyUser({
        userId: lead.id,
        actorUserId: userId,
        project,
        message: `You were appointed Project Lead for ${project.title}, reporting to ${owner.displayName || owner.email}.`,
        transaction
      });
    }
    await notifyUser({
      userId: project.ownerUserId,
      actorUserId: userId,
      project,
      message: `You were assigned as owner of Project: ${project.title}`,
      transaction
    });
    await transaction.commit();
    const loaded = await loadProject(project.id, wineryId);
    return enrichProject(loaded, { wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

function matchesProjectFilters(project, filters, userId) {
  const value = plain(project);
  if (filters.status === 'open' && !['PLANNED', 'ACTIVE', 'ON_HOLD'].includes(value.status)) return false;
  if (filters.status !== 'all' && filters.status !== 'open' && value.status !== filters.status) return false;
  if (filters.ownerUserId !== 'all') {
    const ownerId = filters.ownerUserId === 'me' ? userId : Number(filters.ownerUserId);
    if (Number(value.ownerUserId) !== Number(ownerId)) return false;
  }
  if (filters.search) {
    const haystack = `${value.title || ''} ${value.intendedOutcome || ''} ${value.businessContext || ''}`.toLowerCase();
    if (!haystack.includes(String(filters.search).toLowerCase())) return false;
  }
  if (filters.areaId === 'organisation' && value.areaScope !== 'ORGANISATION') return false;
  if (filters.areaId !== 'all' && filters.areaId !== 'organisation') {
    const areaIds = (value.AreaLinks || []).map(link => Number(link.areaId));
    if (!areaIds.includes(Number(filters.areaId))) return false;
  }
  const targetTime = value.targetEndAt ? new Date(value.targetEndAt).getTime() : null;
  if (filters.targetFrom && (targetTime === null || targetTime < new Date(filters.targetFrom).getTime())) return false;
  if (filters.targetTo && (targetTime === null || targetTime > new Date(filters.targetTo).getTime())) return false;
  return true;
}

function sortProjects(projects, sortBy) {
  const copy = [...projects];
  const timestamp = value => value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
  copy.sort((left, right) => {
    if (sortBy === 'target_soonest') return timestamp(left.targetEndAt) - timestamp(right.targetEndAt);
    if (sortBy === 'target_latest') return timestamp(right.targetEndAt) - timestamp(left.targetEndAt);
    if (sortBy === 'created_oldest') return timestamp(left.createdAt) - timestamp(right.createdAt);
    if (sortBy === 'created_newest') return timestamp(right.createdAt) - timestamp(left.createdAt);
    return timestamp(right.updatedAt) - timestamp(left.updatedAt);
  });
  return copy;
}

async function listProjects({ wineryId, userId, userRole, filters }) {
  const rows = await Project.findAll({ where: { wineryId }, include: projectIncludes() });
  const visible = [];
  for (const project of rows) {
    if (!(await projectVisibility.canViewProject(project, { wineryId, userId, userRole }))) continue;
    if (!matchesProjectFilters(project, filters, userId)) continue;
    const enriched = await enrichProject(project, { wineryId, userId, userRole });
    if (filters.involvement === 'me' && enriched.involvement.roles.length === 0) continue;
    if (filters.health !== 'all' && enriched.summary.health !== filters.health) continue;
    visible.push(enriched);
  }
  const ordered = sortProjects(visible, filters.sortBy);
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    projects: ordered.slice(offset, offset + filters.pageSize),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: ordered.length,
      totalPages: Math.max(1, Math.ceil(ordered.length / filters.pageSize))
    }
  };
}

async function getProjectById({ projectId, wineryId, userId, userRole }) {
  const project = await loadProject(projectId, wineryId);
  if (!project) throw new NotFoundError('Project not found');
  await projectVisibility.assertCanViewProject(project, { wineryId, userId, userRole });
  return enrichProject(project, { wineryId, userId, userRole }, { includeActivity: true });
}

function changed(before, after, fields) {
  return fields.some(field => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

async function createUpdateAuditEvents({ project, before, after, data, wineryId, userId, transaction }) {
  const events = [];
  if (changed(before, after, ['ownerUserId'])) events.push('OWNER_CHANGED');
  if (changed(before, after, ['plannedStartAt', 'targetEndAt'])) events.push('DATES_CHANGED');
  if (changed(before, after, ['riskReason', 'riskReviewAt'])) events.push('RISK_CHANGED');
  if (changed(before, after, ['areaScope', 'primaryAreaId', 'areaIds'])) events.push('AREA_CHANGED');
  if (before.status !== after.status) {
    events.push('STATUS_CHANGED');
    if (after.status === 'CANCELLED') events.push('CANCELLED');
    if (after.status === 'COMPLETED') events.push(data.completionOverride ? 'COMPLETION_OVERRIDDEN' : 'COMPLETED');
    if (before.status === 'COMPLETED' && after.status !== 'COMPLETED') events.push('REOPENED');
  }
  if (events.length === 0) events.push('UPDATED');
  for (const eventType of [...new Set(events)]) {
    await logProjectAudit({
      projectId: project.id,
      wineryId,
      actorUserId: userId,
      eventType,
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: eventType === 'COMPLETION_OVERRIDDEN' ? { completionReason: data.completionReason } : null,
      transaction
    });
  }
}

async function updateProject({ projectId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    const permissionContext = { wineryId, userId, userRole, transaction };
    const permissions = await assertCanCoordinateProject(project, permissionContext);
    const governanceFields = ['ownerUserId', 'areaScope', 'primaryAreaId', 'linkedAreaIds'];
    const changesGovernance = governanceFields.some(field => data[field] !== undefined)
      || data.completionOverride === true
      || Boolean(data.completionReason)
      || ['COMPLETED', 'CANCELLED'].includes(data.status);
    if (!permissions.canGovern && changesGovernance) {
      throw new ForbiddenError('Project Leads can coordinate delivery, but only the accountable owner or an authorised manager can change scope, ownership, or close the Project.');
    }
    const before = snapshot(project);
    const areaUpdate = ['areaScope', 'primaryAreaId', 'linkedAreaIds'].some(field => data[field] !== undefined);
    let placement = {
      areaScope: project.areaScope,
      primaryAreaId: (project.AreaLinks || []).find(link => link.relationshipType === 'PRIMARY')?.areaId || null,
      areaIds: (project.AreaLinks || []).map(link => Number(link.areaId))
    };
    if (areaUpdate) {
      placement = await operationalAreaService.validateAreaPlacement({
        wineryId,
        userId,
        userRole,
        areaScope: data.areaScope || project.areaScope,
        primaryAreaId: data.primaryAreaId !== undefined ? data.primaryAreaId : placement.primaryAreaId,
        linkedAreaIds: data.linkedAreaIds !== undefined
          ? data.linkedAreaIds
          : placement.areaIds.filter(areaId => Number(areaId) !== Number(placement.primaryAreaId)),
        requireManage: true,
        transaction
      });
    }

    const resultingOwnerId = data.ownerUserId !== undefined ? data.ownerUserId : project.ownerUserId;
    const resultingStatus = data.status || project.status;
    const resultingTarget = data.targetEndAt !== undefined ? data.targetEndAt : project.targetEndAt;
    await validateProjectOwner({
      ownerUserId: resultingOwnerId,
      wineryId,
      areaScope: placement.areaScope,
      areaIds: placement.areaIds,
      transaction
    });
    await validateProjectLead({
      leadUserId: project.leadUserId,
      ownerUserId: resultingOwnerId,
      wineryId,
      areaScope: placement.areaScope,
      areaIds: placement.areaIds,
      transaction
    });
    if (resultingStatus === 'ACTIVE' && (!resultingOwnerId || !resultingTarget)) {
      throw new ValidationError('Active Projects require an owner and target date.');
    }

    if (resultingStatus === 'COMPLETED' && project.status !== 'COMPLETED') {
      const itemState = await loadItemEntries({ project, wineryId, userId, userRole, transaction });
      const dependencies = await loadDependencies(project.id, wineryId, transaction);
      const summary = projectSummaryService.buildProjectSummary({ project, itemEntries: itemState.allEntries, dependencies });
      const unresolved = summary.incompleteRequiredTaskCount > 0 || summary.blockedTaskCount > 0 || summary.overdueTaskCount > 0;
      if (unresolved && (!data.completionOverride || !data.completionReason)) {
        throw new ValidationError('Required work remains unresolved. Confirm an override and provide a completion reason.');
      }
      project.actualCompletedAt = new Date();
      project.completionReason = data.completionReason || null;
    }
    if (project.status === 'COMPLETED' && resultingStatus !== 'COMPLETED') {
      project.actualCompletedAt = null;
      project.completionReason = null;
    }

    for (const field of [
      'title', 'intendedOutcome', 'businessContext', 'status', 'ownerUserId',
      'plannedStartAt', 'targetEndAt', 'riskReason', 'riskReviewAt'
    ]) {
      if (data[field] !== undefined) project[field] = data[field] || null;
    }
    project.areaScope = placement.areaScope;
    project.updatedBy = userId;
    await project.save({ transaction });
    if (areaUpdate) await replaceAreas({ projectId, wineryId, placement, transaction });

    const after = snapshot(areaUpdate ? await loadProject(projectId, wineryId, transaction) : project);
    await createUpdateAuditEvents({ project, before, after, data, wineryId, userId, transaction });
    if (before.ownerUserId !== after.ownerUserId) {
      await notifyUser({
        userId: after.ownerUserId,
        actorUserId: userId,
        project,
        message: `You were assigned as owner of Project: ${project.title}`,
        transaction
      });
    } else if (
      Number(project.ownerUserId) !== Number(userId)
      && (before.status !== after.status || changed(before, after, ['targetEndAt']))
    ) {
      await notifyUser({
        userId: project.ownerUserId,
        actorUserId: userId,
        project,
        message: `Project updated: ${project.title}`,
        transaction
      });
    }
    if (data.notifyParticipants) {
      const participants = await ProjectParticipant.findAll({
        where: { projectId, notificationsEnabled: true },
        transaction
      });
      for (const participant of participants) {
        await notifyUser({
          userId: participant.userId,
          actorUserId: userId,
          project,
          message: `Important Project update: ${project.title}`,
          transaction
        });
      }
    }

    await transaction.commit();
    return getProjectById({ projectId, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function addParticipant({ projectId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    await validateSameWineryUsers([data.userId], wineryId, transaction);
    const [participant, created] = await ProjectParticipant.findOrCreate({
      where: { projectId, userId: data.userId },
      defaults: {
        wineryId,
        participationRole: data.participationRole,
        notificationsEnabled: data.notificationsEnabled,
        addedBy: userId
      },
      transaction
    });
    if (!created) {
      const before = plain(participant);
      participant.participationRole = data.participationRole;
      participant.notificationsEnabled = data.notificationsEnabled;
      await participant.save({ transaction });
      await logProjectAudit({
        projectId,
        wineryId,
        actorUserId: userId,
        eventType: 'PARTICIPANT_UPDATED',
        beforeSnapshot: before,
        afterSnapshot: plain(participant),
        metadata: { userId: data.userId },
        transaction
      });
    } else {
      await logProjectAudit({
        projectId,
        wineryId,
        actorUserId: userId,
        eventType: 'PARTICIPANT_ADDED',
        metadata: { userId: data.userId, participationRole: data.participationRole },
        transaction
      });
      if (data.notificationsEnabled) {
        await notifyUser({
          userId: data.userId,
          actorUserId: userId,
          project,
          message: `You were added to Project: ${project.title}`,
          transaction
        });
      }
    }
    await transaction.commit();
    return getProjectById({ projectId, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function updateParticipant({ projectId, participantUserId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const participant = await ProjectParticipant.findOne({
      where: { projectId, userId: participantUserId, wineryId },
      transaction
    });
    if (!participant) throw new NotFoundError('Project participant not found');
    const before = plain(participant);
    await participant.update(data, { transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'PARTICIPANT_UPDATED',
      beforeSnapshot: before,
      afterSnapshot: plain(participant),
      metadata: { userId: participantUserId },
      transaction
    });
    await transaction.commit();
    return getProjectById({ projectId, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function removeParticipant({ projectId, participantUserId, wineryId, userId, userRole }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const participant = await ProjectParticipant.findOne({
      where: { projectId, userId: participantUserId, wineryId },
      transaction
    });
    if (!participant) throw new NotFoundError('Project participant not found');
    await participant.destroy({ transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'PARTICIPANT_REMOVED',
      metadata: { userId: participantUserId },
      transaction
    });
    await transaction.commit();
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

function validateProjectItemMetadata(itemType, data) {
  if (data.isRequired && itemType !== 'TASK') {
    throw new ValidationError('Only Tasks can be required Project work.');
  }
  if (data.isMilestone && !['TASK', 'CALENDAR_EVENT'].includes(itemType)) {
    throw new ValidationError('Only Tasks and Calendar Events can be Project milestones.');
  }
}

async function addProjectItem({ projectId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    validateProjectItemMetadata(data.itemType, data);
    await projectItemResolver.resolveVisibleProjectItem({
      itemType: data.itemType,
      itemId: data.itemId,
      wineryId,
      userId,
      userRole,
      transaction
    });
    const [item, created] = await ProjectItem.findOrCreate({
      where: { projectId, itemType: data.itemType, itemId: data.itemId },
      defaults: {
        wineryId,
        isRequired: data.isRequired,
        isMilestone: data.isMilestone,
        sortOrder: data.sortOrder,
        addedBy: userId
      },
      transaction
    });
    if (!created) {
      item.isRequired = data.isRequired;
      item.isMilestone = data.isMilestone;
      item.sortOrder = data.sortOrder;
      await item.save({ transaction });
    }
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: created ? 'ITEM_LINKED' : 'ITEM_UPDATED',
      metadata: { projectItemId: item.id, itemType: item.itemType, itemId: item.itemId, isRequired: item.isRequired, isMilestone: item.isMilestone },
      transaction
    });
    await transaction.commit();
    return plain(item);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function updateProjectItem({ projectId, projectItemId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const item = await ProjectItem.findOne({ where: { id: projectItemId, projectId, wineryId }, transaction });
    if (!item) throw new NotFoundError('Project item not found');
    validateProjectItemMetadata(item.itemType, {
      isRequired: data.isRequired !== undefined ? data.isRequired : item.isRequired,
      isMilestone: data.isMilestone !== undefined ? data.isMilestone : item.isMilestone
    });
    const before = plain(item);
    await item.update(data, { transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'ITEM_UPDATED',
      beforeSnapshot: before,
      afterSnapshot: plain(item),
      metadata: { projectItemId: item.id, itemType: item.itemType, itemId: item.itemId },
      transaction
    });
    await transaction.commit();
    return plain(item);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function removeProjectItem({ projectId, projectItemId, wineryId, userId, userRole }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const item = await ProjectItem.findOne({ where: { id: projectItemId, projectId, wineryId }, transaction });
    if (!item) throw new NotFoundError('Project item not found');
    if (item.itemType === 'TASK') {
      const removedDependencies = await ProjectTaskDependency.findAll({
        where: {
          projectId,
          [Op.or]: [{ blockingTaskId: item.itemId }, { blockedTaskId: item.itemId }]
        },
        transaction
      });
      await ProjectTaskDependency.destroy({
        where: { id: { [Op.in]: removedDependencies.map(dependency => dependency.id) } },
        transaction
      });
      for (const dependency of removedDependencies) {
        await logProjectAudit({
          projectId,
          wineryId,
          actorUserId: userId,
          eventType: 'DEPENDENCY_REMOVED',
          beforeSnapshot: plain(dependency),
          metadata: {
            dependencyId: dependency.id,
            blockingTaskId: dependency.blockingTaskId,
            blockedTaskId: dependency.blockedTaskId,
            removalReason: 'TASK_UNLINKED'
          },
          transaction
        });
      }
    }
    const metadata = { projectItemId: item.id, itemType: item.itemType, itemId: item.itemId };
    await item.destroy({ transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'ITEM_UNLINKED',
      metadata,
      transaction
    });
    await transaction.commit();
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listProjectItems(context) {
  const project = await loadProject(context.projectId, context.wineryId);
  if (!project) throw new NotFoundError('Project not found');
  await projectVisibility.assertCanViewProject(project, context);
  const detail = await enrichProject(project, context);
  return { items: detail.items, restrictedItemCount: detail.restrictedItemCount };
}

async function listProjectsForItem({ itemType, itemId, wineryId, userId, userRole }) {
  await projectItemResolver.resolveVisibleProjectItem({ itemType, itemId, wineryId, userId, userRole });
  const links = await ProjectItem.findAll({ where: { wineryId, itemType, itemId } });
  const projects = [];
  for (const link of links) {
    const project = await loadProject(link.projectId, wineryId);
    if (!project || !(await projectVisibility.canViewProject(project, { wineryId, userId, userRole }))) continue;
    const enriched = await enrichProject(project, { wineryId, userId, userRole });
    projects.push(enriched);
  }
  return projects;
}

function createsCycle(edges, blockingTaskId, blockedTaskId) {
  const adjacency = new Map();
  for (const edge of edges) {
    const from = Number(edge.blockingTaskId);
    const to = Number(edge.blockedTaskId);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }
  if (!adjacency.has(Number(blockingTaskId))) adjacency.set(Number(blockingTaskId), []);
  adjacency.get(Number(blockingTaskId)).push(Number(blockedTaskId));
  const target = Number(blockingTaskId);
  const stack = [Number(blockedTaskId)];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) || []));
  }
  return false;
}

async function addDependency({ projectId, wineryId, userId, userRole, data }) {
  if (Number(data.blockingTaskId) === Number(data.blockedTaskId)) {
    throw new ValidationError('A Task cannot depend on itself.');
  }
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const linked = await ProjectItem.count({
      where: {
        projectId,
        wineryId,
        itemType: 'TASK',
        itemId: { [Op.in]: [data.blockingTaskId, data.blockedTaskId] }
      },
      transaction
    });
    if (linked !== 2) throw new ValidationError('Both dependency Tasks must be linked to the Project.');
    const edges = await ProjectTaskDependency.findAll({ where: { projectId, wineryId }, transaction });
    if (createsCycle(edges.map(plain), data.blockingTaskId, data.blockedTaskId)) {
      throw new ValidationError('This dependency would create a cycle.');
    }
    const [dependency, created] = await ProjectTaskDependency.findOrCreate({
      where: {
        projectId,
        blockingTaskId: data.blockingTaskId,
        blockedTaskId: data.blockedTaskId
      },
      defaults: { wineryId, createdBy: userId },
      transaction
    });
    if (created) {
      await logProjectAudit({
        projectId,
        wineryId,
        actorUserId: userId,
        eventType: 'DEPENDENCY_ADDED',
        metadata: { dependencyId: dependency.id, ...data },
        transaction
      });
    }
    await transaction.commit();
    return plain(dependency);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listDependencies({ projectId, wineryId, userId, userRole }) {
  const project = await loadProject(projectId, wineryId);
  if (!project) throw new NotFoundError('Project not found');
  await projectVisibility.assertCanViewProject(project, { wineryId, userId, userRole });
  return (await loadDependencies(projectId, wineryId)).map(serializeDependency);
}

async function removeDependency({ projectId, dependencyId, wineryId, userId, userRole }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    const dependency = await ProjectTaskDependency.findOne({
      where: { id: dependencyId, projectId, wineryId },
      transaction
    });
    if (!dependency) throw new NotFoundError('Project dependency not found');
    const metadata = plain(dependency);
    await dependency.destroy({ transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'DEPENDENCY_REMOVED',
      metadata,
      transaction
    });
    await transaction.commit();
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function assignProjectLead({ projectId, wineryId, userId, userRole, leadUserId }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await projectVisibility.assertCanGovernProject(project, { wineryId, userId, userRole, transaction });
    if (['COMPLETED', 'CANCELLED'].includes(project.status)) {
      throw new ValidationError('A Project Lead cannot be appointed to a closed Project. Reopen it first.');
    }
    const areaIds = (project.AreaLinks || []).map(link => Number(link.areaId));
    const lead = await validateProjectLead({
      leadUserId,
      ownerUserId: project.ownerUserId,
      wineryId,
      areaScope: project.areaScope,
      areaIds,
      transaction
    });
    if (Number(project.leadUserId) === Number(lead.id)) {
      await transaction.commit();
      return getProjectById({ projectId, wineryId, userId, userRole });
    }

    const before = snapshot(project);
    const previousLeadUserId = project.leadUserId;
    project.leadUserId = lead.id;
    project.leadGrantedByUserId = userId;
    project.leadGrantedAt = new Date();
    project.updatedBy = userId;
    await project.save({ transaction });
    const after = snapshot(project);
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: previousLeadUserId ? 'LEAD_CHANGED' : 'LEAD_ASSIGNED',
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: {
        previousLeadUserId: previousLeadUserId || null,
        leadUserId: lead.id,
        reportsToUserId: project.ownerUserId
      },
      transaction
    });
    const ownerLabel = project.Owner?.displayName || project.Owner?.email || 'the accountable owner';
    await notifyUser({
      userId: lead.id,
      actorUserId: userId,
      project,
      message: `You were appointed Project Lead for ${project.title}, reporting to ${ownerLabel}.`,
      transaction
    });
    if (previousLeadUserId && Number(previousLeadUserId) !== Number(lead.id)) {
      await notifyUser({
        userId: previousLeadUserId,
        actorUserId: userId,
        project,
        message: `Your Project Lead appointment ended for ${project.title}.`,
        transaction
      });
    }
    await transaction.commit();
    return getProjectById({ projectId, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function revokeProjectLead({ projectId, wineryId, userId, userRole }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    await projectVisibility.assertCanGovernProject(project, { wineryId, userId, userRole, transaction });
    if (!project.leadUserId) {
      await transaction.commit();
      return getProjectById({ projectId, wineryId, userId, userRole });
    }
    const before = snapshot(project);
    const previousLeadUserId = project.leadUserId;
    project.leadUserId = null;
    project.leadGrantedByUserId = null;
    project.leadGrantedAt = null;
    project.updatedBy = userId;
    await project.save({ transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'LEAD_REVOKED',
      beforeSnapshot: before,
      afterSnapshot: snapshot(project),
      metadata: { previousLeadUserId },
      transaction
    });
    await notifyUser({
      userId: previousLeadUserId,
      actorUserId: userId,
      project,
      message: `Your Project Lead appointment ended for ${project.title}.`,
      transaction
    });
    await transaction.commit();
    return getProjectById({ projectId, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function createDelegatedProjectTask({ projectId, wineryId, userId, userRole, data }) {
  const transaction = await Project.sequelize.transaction();
  try {
    const project = await loadProject(projectId, wineryId, transaction);
    if (!project) throw new NotFoundError('Project not found');
    const permissions = await assertCanCoordinateProject(project, { wineryId, userId, userRole, transaction });
    if (!permissions.canDelegateTasks) {
      throw new ForbiddenError('You do not have permission to delegate Tasks for this Project.');
    }
    if (!project.ownerUserId) {
      throw new ValidationError('Assign an accountable Project owner before delegating work.');
    }

    const areaId = Number(data.areaId);
    const projectAreaIds = (project.AreaLinks || []).map(link => Number(link.areaId));
    if (project.areaScope === 'AREAS' && !projectAreaIds.includes(areaId)) {
      throw new ValidationError('Tasks can only be delegated into a participating Project area.');
    }
    const area = await OperationalArea.findOne({
      where: { id: areaId, wineryId, isActive: true },
      attributes: ['id', 'name'],
      transaction
    });
    if (!area) throw new ValidationError('Choose an active operational area in this winery.');

    const assignee = await User.findOne({
      where: { id: data.assigneeId, wineryId, isActive: true },
      attributes: USER_ATTRIBUTES,
      transaction
    });
    if (!assignee) throw new ValidationError('Choose an active assignee in this winery.');
    const membership = await UserAreaMembership.findOne({
      where: { wineryId, userId: assignee.id, areaId },
      transaction
    });
    if (!membership) {
      throw new ValidationError('The assignee must belong to the operational area receiving this Project Task.');
    }

    const body = String(data.body || '').trim();
    const task = await taskCreationService.createTask({
      wineryId,
      userId,
      userRole,
      source: 'project_delegation',
      transaction,
      allowCrossUserAssignment: true,
      allowCrossAreaPlacement: true,
      recordCreatedByUserId: project.ownerUserId,
      data: {
        category: 'INTERNAL',
        subType: 'PROJECT_ACTION',
        priority: data.priority,
        sentiment: 'NEUTRAL',
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        payload: {
          summary: data.title,
          originalText: body,
          projectId: project.id,
          delegatedByUserId: userId,
          delegatedAreaId: areaId
        },
        notes: body || null,
        dueAt: data.dueAt || null,
        assigneeId: assignee.id,
        areaScope: 'AREAS',
        primaryAreaId: areaId,
        linkedAreaIds: []
      }
    });
    const item = await ProjectItem.create({
      wineryId,
      projectId,
      itemType: 'TASK',
      itemId: task.id,
      linkType: 'DELEGATED_WORK',
      isRequired: data.isRequired,
      isMilestone: data.isMilestone,
      sortOrder: 0,
      addedBy: userId
    }, { transaction });
    await logProjectAudit({
      projectId,
      wineryId,
      actorUserId: userId,
      eventType: 'TASK_DELEGATED',
      metadata: {
        projectItemId: item.id,
        taskId: task.id,
        areaId,
        assigneeId: assignee.id,
        isRequired: item.isRequired,
        isMilestone: item.isMilestone
      },
      transaction
    });

    const managerMemberships = await UserAreaMembership.findAll({
      where: { wineryId, areaId, membershipRole: 'MANAGER' },
      attributes: ['userId'],
      transaction
    });
    const notificationUserIds = new Set(managerMemberships.map(row => Number(row.userId)));
    notificationUserIds.add(Number(project.ownerUserId));
    notificationUserIds.delete(Number(userId));
    notificationUserIds.delete(Number(assignee.id));
    if (notificationUserIds.size > 0) {
      const activeRecipients = await User.findAll({
        where: { id: { [Op.in]: [...notificationUserIds] }, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      });
      for (const recipient of activeRecipients) {
        await Notification.create({
          userId: recipient.id,
          type: 'SYSTEM',
          message: `Project Task delegated in ${area.name}: ${data.title}`,
          data: {
            wineryId,
            projectId,
            taskId: task.id,
            areaId,
            assigneeId: assignee.id,
            delegatedByUserId: userId,
            href: `/tasks?taskId=${task.id}`
          }
        }, { transaction });
      }
    }

    await transaction.commit();
    return {
      taskId: task.id,
      project: await getProjectById({ projectId, wineryId, userId, userRole })
    };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listProjectActivity({ projectId, wineryId, userId, userRole, skipPermissionCheck = false }) {
  if (!skipPermissionCheck) {
    const project = await loadProject(projectId, wineryId);
    if (!project) throw new NotFoundError('Project not found');
    await projectVisibility.assertCanViewProject(project, { wineryId, userId, userRole });
  }
  return ProjectAuditEvent.findAll({
    where: { projectId, wineryId },
    include: [{ model: User, as: 'Actor', attributes: USER_ATTRIBUTES, required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  }).then(rows => rows.map(plain));
}

module.exports = {
  logProjectAudit,
  loadProject,
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  addParticipant,
  updateParticipant,
  removeParticipant,
  addProjectItem,
  updateProjectItem,
  removeProjectItem,
  listProjectItems,
  listProjectsForItem,
  addDependency,
  listDependencies,
  removeDependency,
  assignProjectLead,
  revokeProjectLead,
  createDelegatedProjectTask,
  listProjectActivity
};
