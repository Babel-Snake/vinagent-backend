const Sequelize = require('sequelize');
const { Op } = Sequelize;
const {
  Attachment,
  Member,
  Message,
  Task,
  TaskAction,
  TaskArea,
  TaskStep,
  User,
  UserTaskFlag
} = require('../models');
const recordVisibility = require('./recordVisibility.service');
const taskDeadlineService = require('./taskDeadline.service');
const { getTaskAreaInclude } = require('./taskArea.service');
const {
  applyStandardTaskFilters,
  buildTaskOrder,
  emptyTaskPage,
  intersectTaskIds,
  normalizeTaskPagination
} = require('./taskQueryPolicy.service');

function payloadFor(task) {
  if (!task?.payload) return {};
  if (typeof task.payload === 'string') {
    try {
      return JSON.parse(task.payload);
    } catch {
      return {};
    }
  }
  return task.payload;
}

function summarizeQueueTasks(tasks) {
  return tasks.reduce((summary, task) => {
    const payload = payloadFor(task);
    const manualIntake = payload?.manualIntake;

    summary.matching += 1;
    if (task.priority === 'high') summary.highPriority += 1;
    if (task.workflowState === 'WAITING') summary.waiting += 1;
    if (task.workflowState === 'BLOCKED') summary.blocked += 1;
    if (!task.assigneeId && task.status === 'PENDING') summary.unassigned += 1;
    if (task.isOverdue) summary.overdue += 1;
    if (task.isDueSoon) summary.dueSoon += 1;
    if (manualIntake?.identityResolutionStatus === 'REVIEW_REQUIRED') summary.identityReview += 1;
    if (task.followUpRequired || task.parentTaskId || payload?.followUpAutomation) summary.followUps += 1;
    return summary;
  }, {
    matching: 0,
    highPriority: 0,
    waiting: 0,
    blocked: 0,
    unassigned: 0,
    overdue: 0,
    dueSoon: 0,
    identityReview: 0,
    followUps: 0
  });
}

async function getTasksForWinery({ wineryId, userId, userRole, filters = {}, pagination = {}, summary = false }) {
  const { areaId, search, sortBy, showOnlyFlagged, mentionedMe, actionedById } = filters;
  const { page, limit, offset } = normalizeTaskPagination(pagination);
  const whereClause = { wineryId };
  let idFilters = null;

  if (showOnlyFlagged === 'true' || showOnlyFlagged === true) {
    const flags = await UserTaskFlag.findAll({ where: { userId } });
    const flaggedIds = flags.map(flag => flag.taskId);
    if (flaggedIds.length === 0) {
      return emptyTaskPage(limit);
    }
    idFilters = intersectTaskIds(idFilters, flaggedIds);
  }

  if (mentionedMe === 'true' || mentionedMe === true) {
    const currentUser = await User.findByPk(userId);
    if (currentUser && currentUser.displayName) {
      const mentionSearchOp = { [Op.like]: `%@${currentUser.displayName}%` };
      const actions = await TaskAction.findAll({
        attributes: ['taskId'],
        where: {
          actionType: 'NOTE_ADDED',
          [Op.and]: [
            Sequelize.where(
              Sequelize.cast(Sequelize.col('details'), 'char'),
              mentionSearchOp
            )
          ]
        }
      });
      const actionTaskIds = [...new Set(actions.map(action => action.taskId))];
      idFilters = intersectTaskIds(idFilters, actionTaskIds);
      if (idFilters.length === 0) return emptyTaskPage(limit);
    } else {
      return emptyTaskPage(limit);
    }
  }

  if (actionedById && actionedById !== 'all') {
    const actionUserId = actionedById === 'me' ? userId : Number(actionedById);
    const actions = await TaskAction.findAll({
      attributes: ['taskId'],
      where: {
        userId: actionUserId,
        actionType: 'ACTIONED'
      }
    });
    const actionTaskIds = [...new Set(actions.map(action => action.taskId))];
    idFilters = intersectTaskIds(idFilters, actionTaskIds);
    if (idFilters.length === 0) return emptyTaskPage(limit);
  }

  if (idFilters !== null) {
    whereClause.id = { [Op.in]: idFilters };
  }

  applyStandardTaskFilters({
    whereClause,
    filters,
    userId,
    Op,
    dueSoonHours: taskDeadlineService.getDeadlineConfig().dueSoonHours
  });

  const visibilityPredicate = await recordVisibility.buildTaskVisibilityPredicate({ wineryId, userId, userRole });
  if (visibilityPredicate) {
    whereClause[Op.and] = [...(whereClause[Op.and] || []), visibilityPredicate];
  }

  if (areaId && areaId !== 'all') {
    if (areaId === 'organisation') {
      whereClause.areaScope = 'ORGANISATION';
    } else {
      const areaTaskRows = await TaskArea.findAll({
        where: { wineryId, areaId: Number(areaId) },
        attributes: ['taskId']
      });
      const areaTaskIds = areaTaskRows.map(row => Number(row.taskId));
      if (areaTaskIds.length === 0) {
        return emptyTaskPage(limit);
      }
      whereClause.id = whereClause.id
        ? { [Op.and]: [whereClause.id, { [Op.in]: areaTaskIds }] }
        : { [Op.in]: areaTaskIds };
    }
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const searchOp = { [Op.like]: term };

    const members = await Member.findAll({
      attributes: ['id'],
      where: {
        wineryId,
        [Op.or]: [
          { firstName: searchOp },
          { lastName: searchOp },
          { email: searchOp },
          { phone: searchOp }
        ]
      }
    });
    const memberIds = members.map(member => member.id);

    const actions = await TaskAction.findAll({
      attributes: ['taskId'],
      where: {
        actionType: 'NOTE_ADDED',
        [Op.and]: [
          Sequelize.where(
            Sequelize.cast(Sequelize.col('details'), 'char'),
            searchOp
          )
        ]
      }
    });
    const actionTaskIds = actions.map(action => action.taskId);

    const attachmentRows = await Attachment.findAll({
      where: {
        wineryId,
        deletedAt: null,
        entityType: { [Op.in]: ['TASK', 'TASK_OUTCOME', 'TASK_FOLLOW_UP'] },
        [Op.or]: [
          { filename: searchOp },
          { originalFilename: searchOp }
        ]
      },
      attributes: ['entityId']
    });
    const stepAttachmentRows = await Attachment.findAll({
      where: {
        wineryId,
        deletedAt: null,
        entityType: 'TASK_STEP',
        [Op.or]: [
          { filename: searchOp },
          { originalFilename: searchOp }
        ]
      },
      attributes: ['entityId']
    });
    const attachmentStepIds = stepAttachmentRows.map(row => Number(row.entityId));
    const attachmentSteps = attachmentStepIds.length > 0
      ? await TaskStep.findAll({ where: { id: { [Op.in]: attachmentStepIds } }, attributes: ['taskId'] })
      : [];
    const attachmentTaskIds = [
      ...attachmentRows.map(row => Number(row.entityId)),
      ...attachmentSteps.map(row => Number(row.taskId))
    ];

    const payloadTasks = await Task.findAll({
      attributes: ['id'],
      where: {
        wineryId,
        [Op.and]: [
          Sequelize.where(
            Sequelize.cast(Sequelize.col('payload'), 'char'),
            searchOp
          )
        ]
      }
    });
    const payloadTaskIds = payloadTasks.map(task => task.id);

    const messages = await Message.findAll({
      attributes: ['id', 'taskId'],
      where: {
        wineryId,
        [Op.or]: [
          { body: searchOp },
          { subject: searchOp }
        ]
      }
    });
    const messageTaskIds = messages
      .map(message => message.taskId)
      .filter(Boolean);
    const orphanMessageIds = messages
      .filter(message => !message.taskId)
      .map(message => message.id);
    let legacyMessageTaskIds = [];
    if (orphanMessageIds.length > 0) {
      const legacyMessageTasks = await Task.findAll({
        attributes: ['id'],
        where: {
          wineryId,
          messageId: { [Op.in]: orphanMessageIds }
        }
      });
      legacyMessageTaskIds = legacyMessageTasks.map(task => task.id);
    }

    const combinedIds = [...new Set([
      ...actionTaskIds,
      ...attachmentTaskIds,
      ...payloadTaskIds,
      ...messageTaskIds,
      ...legacyMessageTaskIds
    ])];
    const searchOrConditions = [];

    const isStrictId = /^\d+$/.test(search.trim());
    if (isStrictId) {
      searchOrConditions.push({ id: parseInt(search.trim()) });
    }

    searchOrConditions.push({ category: searchOp });
    searchOrConditions.push({ subType: searchOp });

    if (combinedIds.length > 0) {
      searchOrConditions.push({ id: { [Op.in]: combinedIds } });
    }
    if (memberIds.length > 0) {
      searchOrConditions.push({ memberId: { [Op.in]: memberIds } });
    }

    whereClause[Op.and] = [
      ...(whereClause[Op.and] || []),
      { [Op.or]: searchOrConditions }
    ];
  }

  const order = buildTaskOrder({
    sortBy,
    search,
    Sequelize,
    sequelize: Task.sequelize,
    deadlineService: taskDeadlineService
  });

  if (summary) {
    const rows = await Task.findAll({
      where: whereClause,
      attributes: [
        'id', 'status', 'priority', 'workflowState', 'assigneeId', 'dueAt',
        'payload', 'parentTaskId', 'followUpRequired'
      ]
    });
    const tasks = rows.map(task => taskDeadlineService.attachDeadlineState(task));
    return { summary: summarizeQueueTasks(tasks) };
  }

  const { count, rows } = await Task.findAndCountAll({
    where: whereClause,
    include: [
      { model: Member, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
      { model: User, as: 'Creator', attributes: ['id', 'displayName', 'role'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
      getTaskAreaInclude()
    ],
    order,
    limit,
    offset
  });

  return {
    tasks: rows.map(task => taskDeadlineService.attachDeadlineState(task)),
    pagination: {
      page,
      pageSize: limit,
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  };
}

async function getTaskQueueSummary(options) {
  return getTasksForWinery({ ...options, summary: true });
}

module.exports = {
  getTasksForWinery,
  getTaskQueueSummary
};
