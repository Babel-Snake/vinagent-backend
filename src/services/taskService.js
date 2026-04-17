const { Task, TaskStep, WinerySettings, Member, Message, User, TaskAction, Notification } = require('../models');
const { Op } = require('sequelize');
const executionService = require('./execution.service');
const logger = require('../config/logger');
const { validateStatusTransition } = require('../utils/validation');
const auditService = require('./audit.service');
const aiSuggestionService = require('./aiSuggestion.service');

/**
 * Service to handle Task creation and updates.
 * Centralizes business logic, logging, and side effects.
 */

// Pre-actioning payload validation per task type
function validatePayloadForActioning(task) {
  const errors = [];

  if (task.subType === 'ACCOUNT_ADDRESS_CHANGE' || task.type === 'ADDRESS_CHANGE') {
    const p = task.payload && task.payload.newAddress ? task.payload.newAddress : (task.payload || {});
    if (!p.addressLine1) errors.push('Address Line 1 is required');
    if (!p.suburb) errors.push('Suburb is required');
    if (!p.postcode) errors.push('Postcode is required');
    if (!task.memberId) errors.push('Member ID is required for address change');
  }

  if (task.subType === 'BOOKING_NEW') {
    const p = task.payload || {};
    if (!p.date) errors.push('Booking date is required');
    if (!p.time) errors.push('Booking time is required');
    if (!p.pax) errors.push('Party size (pax) is required');
  }

  return errors;
}

const ACTIVE_WORKFLOW_WAITING_ON = new Set(['CUSTOMER', 'MANAGER', 'EXTERNAL']);
const STEP_TERMINAL_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);

async function getOrderedTaskSteps(taskId, transaction) {
  return TaskStep.findAll({
    where: { taskId },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    transaction
  });
}

function normalizeTaskStepInput(step, index = 0, fallbackOwnerUserId = null) {
  return {
    title: String(step.title || `Step ${index + 1}`).trim().slice(0, 200),
    description: step.description ? String(step.description).trim().slice(0, 4000) : null,
    stepType: step.stepType || 'INTERNAL',
    status: step.status || 'PENDING',
    waitingOn: step.waitingOn || 'NONE',
    ownerUserId: Number.isInteger(step.ownerUserId) ? step.ownerUserId : fallbackOwnerUserId,
    dueAt: step.dueAt ? new Date(step.dueAt) : null,
    sortOrder: Number.isInteger(step.sortOrder) ? step.sortOrder : index,
    blockedReason: step.blockedReason ? String(step.blockedReason).trim() : null,
    completionNotes: step.completionNotes ? String(step.completionNotes).trim() : null,
    metadata: step.metadata || null
  };
}

async function createTaskSteps({ taskId, steps = [], fallbackOwnerUserId, userId, transaction }) {
  const createdSteps = [];

  for (let index = 0; index < steps.length; index += 1) {
    const stepData = normalizeTaskStepInput(steps[index], index, fallbackOwnerUserId);
    const createdStep = await TaskStep.create({
      taskId,
      ...stepData,
      createdBy: userId || null,
      updatedBy: userId || null,
      completedAt: stepData.status === 'COMPLETED' ? new Date() : null
    }, { transaction });

    createdSteps.push(createdStep);

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: 'STEP_CREATED',
      details: {
        stepId: createdStep.id,
        title: createdStep.title,
        status: createdStep.status,
        waitingOn: createdStep.waitingOn,
        ownerUserId: createdStep.ownerUserId,
        sortOrder: createdStep.sortOrder
      }
    });
  }

  return createdSteps;
}

function buildWorkflowSummary(task, steps) {
  if (task.status === 'REJECTED') {
    return {
      workflowState: 'CANCELLED',
      waitingOn: 'NONE',
      nextStepSummary: null,
      blockedReason: null,
      dueAt: null,
      resolvedAt: task.resolvedAt || new Date()
    };
  }

  if (!steps || steps.length === 0) {
    if (task.status === 'ACTIONED') {
      return {
        workflowState: 'COMPLETED',
        waitingOn: 'NONE',
        nextStepSummary: null,
        blockedReason: null,
        dueAt: null,
        resolvedAt: task.resolvedAt || new Date()
      };
    }

    return {
      workflowState: task.workflowState || 'NOT_STARTED',
      waitingOn: task.waitingOn || 'NONE',
      nextStepSummary: task.nextStepSummary || null,
      blockedReason: null,
      dueAt: task.dueAt || null,
      resolvedAt: null
    };
  }

  const activeSteps = steps.filter(step => !STEP_TERMINAL_STATUSES.has(step.status));

  if (activeSteps.length === 0) {
    return {
      workflowState: 'COMPLETED',
      waitingOn: 'NONE',
      nextStepSummary: null,
      blockedReason: null,
      dueAt: null,
      resolvedAt: task.resolvedAt || new Date()
    };
  }

  const blockedStep = activeSteps.find(step => step.status === 'BLOCKED');
  const inProgressStep = activeSteps.find(step => step.status === 'IN_PROGRESS');
  const nextPendingStep = activeSteps.find(step => step.status === 'PENDING');
  const focusStep = blockedStep || inProgressStep || nextPendingStep || activeSteps[0];

  let workflowState = 'NOT_STARTED';
  if (focusStep.status === 'BLOCKED') {
    workflowState = 'BLOCKED';
  } else if (focusStep.status === 'IN_PROGRESS') {
    workflowState = ACTIVE_WORKFLOW_WAITING_ON.has(focusStep.waitingOn) ? 'WAITING' : 'IN_PROGRESS';
  } else if (ACTIVE_WORKFLOW_WAITING_ON.has(focusStep.waitingOn)) {
    workflowState = 'WAITING';
  }

  const nearestDueStep = activeSteps
    .filter(step => step.dueAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  return {
    workflowState,
    waitingOn: workflowState === 'BLOCKED' ? (focusStep.waitingOn || 'STAFF') : (focusStep.waitingOn || 'NONE'),
    nextStepSummary: focusStep.title,
    blockedReason: workflowState === 'BLOCKED' ? (focusStep.blockedReason || task.blockedReason || null) : null,
    dueAt: focusStep.dueAt || nearestDueStep?.dueAt || null,
    resolvedAt: null
  };
}

async function syncTaskWorkflow(task, transaction) {
  const steps = await getOrderedTaskSteps(task.id, transaction);
  const summary = buildWorkflowSummary(task, steps);

  task.workflowState = summary.workflowState;
  task.waitingOn = summary.waitingOn;
  task.nextStepSummary = summary.nextStepSummary;
  task.blockedReason = summary.blockedReason;
  task.dueAt = summary.dueAt;
  task.resolvedAt = summary.resolvedAt;

  await task.save({ transaction });
  return { task, steps, summary };
}

function queueSuggestionRefresh(taskId, wineryId) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  setImmediate(() => {
    aiSuggestionService.generateAiSuggestion(taskId, wineryId, {
      force: true,
      includeHistory: true
    });
  });
}

// --- CORE METHODS ---

// --- HELPERS ---

async function determineAutoAssignee(wineryId, data) {
  // 1. Negative Sentiment -> escalate to Manager
  if (data.sentiment === 'NEGATIVE') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

  // 2. Operations / Internal -> Manager
  if (data.category === 'OPERATIONS' || data.category === 'INTERNAL') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

  // 3. Orders -> Staff
  if (data.category === 'ORDER') {
    const staff = await User.findOne({ where: { wineryId, role: 'staff' } });
    if (staff) return staff.id;
  }

  return null;
}

/**
 * Creates a new task (manually or via triage).
 */
async function createTask({ wineryId, userId, data, source = 'manual', transaction = null }) {
  const ownTransaction = !transaction;
  const t = transaction || await Task.sequelize.transaction();
  try {
    const {
      category, subType, customerType, type, memberId, messageId,
      payload, priority, notes, sentiment, assigneeId, parentTaskId,
      initialNote, suggestedReplyBody, suggestedChannel, suggestedReplySubject,
      suggestedAction, suggestedRecipientEmail, suggestedCc, dueAt,
      resolutionSummary, steps = []
    } = data;
    const finalAssigneeId = assigneeId || await determineAutoAssignee(wineryId, data);

    // 1. Create Task
    const task = await Task.create({
      wineryId,
      category: category || 'INTERNAL',
      subType: subType || 'INTERNAL_TASK',
      customerType: customerType || 'UNKNOWN',
      type: subType || type || 'INTERNAL_TASK', // Legacy fallback
      status: 'PENDING',
      priority: priority || 'normal',
      sentiment: sentiment || 'NEUTRAL',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      payload: payload || {},
      memberId: memberId || null,
      messageId: messageId || null,
      suggestedReplyBody: suggestedReplyBody || null,
      suggestedChannel: suggestedChannel || null,
      suggestedReplySubject: suggestedReplySubject || null,
      suggestedAction: suggestedAction || null,
      suggestedRecipientEmail: suggestedRecipientEmail || null,
      suggestedCc: suggestedCc || null,
      dueAt: dueAt || null,
      resolutionSummary: resolutionSummary || null,
      createdBy: userId,
      updatedBy: userId,
      assigneeId: finalAssigneeId,
      parentTaskId: parentTaskId || null
    }, { transaction: t });

    // 2. Log Creation Action
    await auditService.logTaskAction({
      transaction: t,
      taskId: task.id,
      userId,
      actionType: source === 'manual' ? 'MANUAL_CREATED' : 'CREATED',
      details: {
        source,
        notes,
        originalText: payload?.originalText,
        stepCount: Array.isArray(steps) ? steps.length : 0
      }
    });

    // 3. Log Linking Action (if needed)
    if (parentTaskId) {
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: {
          parentTaskId,
          childTaskId: task.id
        }
        });
    }

    // 4. Create structured workflow steps
    if (Array.isArray(steps) && steps.length > 0) {
      await createTaskSteps({
        taskId: task.id,
        steps,
        fallbackOwnerUserId: finalAssigneeId,
        userId,
        transaction: t
      });
    }

    // 5. Log Initial Note + Process @Mentions (if provided)
    if (initialNote && initialNote.trim()) {
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details: { note: initialNote.trim() }
      });

      await processMentions({
        text: initialNote.trim(),
        wineryId,
        senderId: userId,
        taskId: task.id,
        transaction: t
      });
    }

    await syncTaskWorkflow(task, t);

    if (ownTransaction) {
      await t.commit();
    }
    logger.info('Task created', { taskId: task.id, userId, wineryId, source });

    return task;

  } catch (err) {
    if (ownTransaction && !t.finished) await t.rollback();
    throw err;
  }
}

/**
 * Updates an existing task.
 * Handles status transitions, assignment, linking, and execution triggers.
 */
async function updateTask({ taskId, wineryId, userId, userRole, updates }) {
  const t = await Task.sequelize.transaction();
  let noteAdded = false;
  let regenerateRequested = false;
  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const {
      status, payload, priority, notes, suggestedReplyBody,
      category, subType, sentiment, assigneeId, parentTaskId,
      suggestedChannel, suggestedReplySubject, regenerateSuggestedReply,
      isPrivateNote, dueAt, resolutionSummary
    } = updates;

    // --- LAYER 2: STATUS TRANSITION GUARD ---
    if (status && status !== task.status) {
      if (!validateStatusTransition(task.status, status)) {
        const err = new Error(`Invalid status transition: ${task.status} → ${status}`);
        err.statusCode = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }
    }

    // --- LAYER 2: ROLE CHECK FOR REJECTION ---
    if (status === 'REJECTED' && status !== task.status) {
      if (userRole === 'staff') {
        const err = new Error('Staff cannot reject tasks.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    // --- LAYER 2: PAYLOAD VALIDATION FOR ACTIONING ---
    // Note: Removed hard-block. Users should be able to action tasks freely.
    // The execution service handles missing payload data gracefully.

    // --- LAYER 2: STAFF CANNOT REASSIGN TASKS ---
    if (updates.assigneeId !== undefined && updates.assigneeId !== task.assigneeId) {
      if (userRole === 'staff') {
        const err = new Error('Staff cannot reassign tasks.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const changes = {};
    const oldValues = {};

    // Helper to track changes
    const setField = (field, value) => {
      if (value !== undefined && value !== task[field]) {
        changes[field] = value;
        oldValues[field] = task[field];
        task[field] = value;
      }
    };

    // Apply fields
    setField('status', status);
    setField('priority', priority);
    setField('category', category);
    setField('subType', subType);
    setField('sentiment', sentiment);
    setField('suggestedReplyBody', suggestedReplyBody);
    setField('suggestedChannel', suggestedChannel);
    setField('suggestedReplySubject', suggestedReplySubject);
    setField('dueAt', dueAt ? new Date(dueAt) : dueAt);
    setField('resolutionSummary', resolutionSummary);

    // Special logic: Linking
    if (parentTaskId !== undefined && parentTaskId !== task.parentTaskId) {
      setField('parentTaskId', parentTaskId);
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: {
          parentTaskId,
          childTaskId: task.id
        }
      });
    }

    // Special logic: Assignment
    if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
      const oldAssignee = task.assigneeId;
      setField('assigneeId', assigneeId);
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'ASSIGNED',
        details: {
          from: oldAssignee,
          to: assigneeId
        }
      });
    }

    // Deep Payload update
    if (payload) {
      changes.payload = payload;
      oldValues.payload = task.payload;
      task.payload = payload;
    }

    task.updatedBy = userId;
    await task.save({ transaction: t });

    // Generic Update Action
    if (Object.keys(changes).length > 0) {
      let actionType = 'MANUAL_UPDATE';
      if (changes.status === 'ACTIONED') actionType = 'ACTIONED';
      if (changes.status === 'REJECTED') actionType = 'REJECTED';

      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType,
        details: { changes, oldValues }
      });
    }

    // Notes
    if (notes) {
      const detailsObj = { note: notes };
      if (isPrivateNote) {
        detailsObj.isPrivate = true;
      }

      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details: detailsObj
      });
      noteAdded = true;

      // Process Mentions
      await processMentions({
        text: notes,
        wineryId,
        senderId: userId,
        taskId: task.id,
        transaction: t
      });
    }

    // EXECUTION TRIGGER (best-effort — don't block status change if execution fails)
    if (changes.status === 'ACTIONED') {
      try {
        const settings = await WinerySettings.findOne({ where: { wineryId } });
        await executionService.executeTask(task, t, settings);
      } catch (execErr) {
        logger.warn('Execution skipped for task', { taskId, reason: execErr.message });
      }
    }

    await syncTaskWorkflow(task, t);

    await t.commit();
    logger.info('Task updated', { taskId, userId, changes: Object.keys(changes) });

    if (regenerateSuggestedReply) {
      regenerateRequested = true;
      await aiSuggestionService.generateAiSuggestion(task.id, wineryId, {
        force: true,
        includeHistory: true
      });
    }

    if (noteAdded && !regenerateSuggestedReply) {
      queueSuggestionRefresh(task.id, wineryId);
    }

    if (regenerateRequested) {
      const refreshed = await Task.findByPk(task.id);
      return refreshed || task;
    }
    return task;

  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

/**
 * Get tasks for a winery with filtering and pagination
 */
async function getTasksForWinery({ wineryId, userId, userRole, filters = {}, pagination = {} }) {
  const { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById } = filters;
  const { page = 1, pageSize = 20 } = pagination;
  const Sequelize = require('sequelize');
  const { UserTaskFlag, User, TaskAction } = require('../models');

  // Validate pagination parameters
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const whereClause = { wineryId };
  
  let idFilters = null;

  // --- FLAG FILTER ---
  if (showOnlyFlagged === 'true' || showOnlyFlagged === true) {
    const flags = await UserTaskFlag.findAll({ where: { userId } });
    const flaggedIds = flags.map(f => f.taskId);
    if (flaggedIds.length === 0) {
      // If none flagged by user, return empty instantly
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
    idFilters = flaggedIds;
  }

  // --- MENTIONS FILTER ---
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
      const actionTaskIds = [...new Set(actions.map(a => a.taskId))];
      
      if (actionTaskIds.length === 0) {
        return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
      }
      
      if (idFilters === null) {
        idFilters = actionTaskIds;
      } else {
        idFilters = idFilters.filter(id => actionTaskIds.includes(id));
        if (idFilters.length === 0) {
          return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
        }
      }
    } else {
      // If no displayName exists, user cannot be mentioned
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
  }

  // --- ACTIONED BY FILTER ---
  if (actionedById && actionedById !== 'all') {
    const actionUserId = actionedById === 'me' ? userId : Number(actionedById);
    const actions = await TaskAction.findAll({
      attributes: ['taskId'],
      where: {
        userId: actionUserId,
        actionType: 'ACTIONED'
      }
    });
    const actionTaskIds = [...new Set(actions.map(a => a.taskId))];
    
    if (actionTaskIds.length === 0) {
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
    
    if (idFilters === null) {
      idFilters = actionTaskIds;
    } else {
      idFilters = idFilters.filter(id => actionTaskIds.includes(id));
      if (idFilters.length === 0) {
        return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
      }
    }
  }

  if (idFilters !== null) {
    whereClause.id = { [Op.in]: idFilters };
  }

  // --- STANDARD FILTERS ---
  if (status && status !== 'all') whereClause.status = status;
  if (type && type !== 'all') whereClause.type = type;
  if (priority && priority !== 'all') whereClause.priority = priority;
  if (category && category !== 'all') whereClause.category = category;
  if (sentiment && sentiment !== 'all') whereClause.sentiment = sentiment;

  // --- DATE RANGE FILTERS ---
  if (dateFrom || dateTo) {
    whereClause.createdAt = {};
    if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo) {
      // Set to end of day if only date provided
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      whereClause.createdAt[Op.lte] = d;
    }
  }

  if (assigneeId && assigneeId !== 'all') {
    if (assigneeId === 'unassigned') whereClause.assigneeId = null;
    else if (assigneeId === 'me') whereClause.assigneeId = userId; // Should already be covered by generic logic but explicit is safe
    else whereClause.assigneeId = Number(assigneeId);
  }

  if (createdById && createdById !== 'all') {
    if (createdById === 'system') whereClause.createdBy = null; // Assuming system is null or checks relation
    else whereClause.createdBy = Number(createdById);
  }

  // RBAC: Staff can only see their assigned tasks or unassigned tasks (unless overridden)
  if (userRole === 'staff') {
    whereClause[Op.or] = [
      { assigneeId: userId },
      { assigneeId: null }
    ];
  } else if (assignedToMe === 'true') {
    whereClause.assigneeId = userId;
  }





  // --- DEEP SEARCH ---
  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const searchOp = { [Op.like]: term };



    // 1. Find matching Members
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
    const memberIds = members.map(m => m.id);

    // 2. Find matching TaskActions (Notes)
    // Cast details to text to search the JSON blob
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
    const actionTaskIds = actions.map(a => a.taskId);

    // 3. Find matching Payloads (on Task itself)
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
    const payloadTaskIds = payloadTasks.map(t => t.id);

    // Combine explicit ID matches (from payload/notes)
    const combinedIds = [...new Set([...actionTaskIds, ...payloadTaskIds])];

    // Build the OR conditions
    const searchOrConditions = [];


    // A. ID Match (if numeric)
    // Use strict regex to avoid matching "123 abc" as ID 123
    const isStrictid = /^\d+$/.test(search.trim());
    if (isStrictid) {
      searchOrConditions.push({ id: parseInt(search.trim()) });
    }

    // B. Direct Column Matches
    searchOrConditions.push({ category: searchOp });
    searchOrConditions.push({ subType: searchOp });

    // C. Indirect Matches (Member, Note, Payload)
    if (combinedIds.length > 0) {
      searchOrConditions.push({ id: { [Op.in]: combinedIds } });
    }
    if (memberIds.length > 0) {
      searchOrConditions.push({ memberId: { [Op.in]: memberIds } });
    }

    // Apply to Main Where Clause
    whereClause[Op.and] = [
      ...(whereClause[Op.and] || []),
      { [Op.or]: searchOrConditions }
    ];
  }


  // Sorting
  const order = [['createdAt', sortBy === 'oldest' ? 'ASC' : 'DESC']];


  // Prioritize exact ID match if search is strictly numeric
  if (search && /^\d+$/.test(search.trim())) {
    const exactId = parseInt(search.trim());
    // MySQL boolean expression: (id = val) returns 1 if true, 0 if false. DESC puts 1 (match) first.
    // Use qualified column name `Task`.`id` to avoid ambiguity with joined tables
    order.unshift([Sequelize.literal(`\`Task\`.\`id\` = ${exactId}`), 'DESC']);
  }


  const { count, rows } = await Task.findAndCountAll({
    where: whereClause,

    include: [
      { model: Member, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
      { model: User, as: 'Creator', attributes: ['id', 'displayName', 'role'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
    ],
    order: order,
    limit,
    offset
  });

  return {
    tasks: rows,
    pagination: {
      page: parseInt(page) || 1,
      pageSize: limit,
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  };
}

/**
 * Get a single task by ID
 */
async function getTaskById({ taskId, wineryId }) {
  const task = await Task.findOne({
    where: { id: taskId, wineryId },
    include: [
      { model: Member },
      { model: Message },
      { model: User, as: 'Creator', attributes: ['id', 'displayName'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
      {
        model: TaskStep,
        as: 'TaskSteps',
        separate: true,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
      },
      {
        model: TaskAction,
        separate: true,
        order: [['createdAt', 'DESC']], // recent first
        limit: 50, // Safety limit
        include: [{ model: User, attributes: ['id', 'displayName', 'role'] }]
      }
    ]
  });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Re-sort actions for frontend if needed (frontend expects chronological?)
  // The frontend sorts them: .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  // So returning them DESC is fine, frontend will re-sort. 
  // But wait, if we limit 50 DESC, we get the *latest* 50.
  // Frontend sorts ASC. So we'll have the last 50 actions, in correct order after frontend sort.

  return task;
}

async function createTaskStep({ taskId, wineryId, userId, data }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const existingSteps = await getOrderedTaskSteps(taskId, t);
    const normalized = normalizeTaskStepInput(data, existingSteps.length, task.assigneeId || null);

    const step = await TaskStep.create({
      taskId,
      ...normalized,
      createdBy: userId,
      updatedBy: userId,
      completedAt: normalized.status === 'COMPLETED' ? new Date() : null
    }, { transaction: t });

    await auditService.logTaskAction({
      transaction: t,
      taskId,
      userId,
      actionType: normalized.status === 'COMPLETED' ? 'STEP_COMPLETED' : 'STEP_CREATED',
      details: {
        stepId: step.id,
        title: step.title,
        status: step.status,
        waitingOn: step.waitingOn,
        ownerUserId: step.ownerUserId,
        sortOrder: step.sortOrder
      }
    });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function updateTaskStep({ taskId, stepId, wineryId, userId, userRole, updates }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction: t });
    if (!step) throw new Error('Task step not found');

    if (updates.ownerUserId !== undefined && updates.ownerUserId !== step.ownerUserId && userRole === 'staff') {
      const err = new Error('Staff cannot reassign task steps.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const changes = {};
    const oldValues = {};
    const setStepField = (field, value) => {
      if (value !== undefined && value !== step[field]) {
        changes[field] = value;
        oldValues[field] = step[field];
        step[field] = value;
      }
    };

    setStepField('title', updates.title);
    setStepField('description', updates.description);
    setStepField('stepType', updates.stepType);
    setStepField('status', updates.status);
    setStepField('waitingOn', updates.waitingOn);
    setStepField('ownerUserId', updates.ownerUserId);
    setStepField('sortOrder', updates.sortOrder);
    setStepField('blockedReason', updates.blockedReason);
    setStepField('completionNotes', updates.completionNotes);
    if (updates.dueAt !== undefined) {
      setStepField('dueAt', updates.dueAt ? new Date(updates.dueAt) : null);
    }
    if (updates.metadata !== undefined) {
      changes.metadata = updates.metadata;
      oldValues.metadata = step.metadata;
      step.metadata = updates.metadata;
    }

    const previousStatus = oldValues.status !== undefined ? oldValues.status : step.status;

    if (updates.status === 'COMPLETED' && previousStatus !== 'COMPLETED') {
      step.completedAt = new Date();
      changes.completedAt = step.completedAt;
    } else if (updates.status === 'COMPLETED') {
      step.completedAt = step.completedAt || new Date();
    } else if (updates.status && updates.status !== 'COMPLETED') {
      step.completedAt = null;
      changes.completedAt = null;
    }

    step.updatedBy = userId;
    await step.save({ transaction: t });

    if (Object.keys(changes).length > 0) {
      await auditService.logTaskAction({
        transaction: t,
        taskId,
        userId,
        actionType: changes.status === 'COMPLETED' ? 'STEP_COMPLETED' : 'STEP_UPDATED',
        details: {
          stepId: step.id,
          title: step.title,
          changes,
          oldValues
        }
      });
    }

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function deleteTaskStep({ taskId, stepId, wineryId, userId }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction: t });
    if (!step) throw new Error('Task step not found');

    await auditService.logTaskAction({
      transaction: t,
      taskId,
      userId,
      actionType: 'STEP_DELETED',
      details: {
        stepId: step.id,
        title: step.title,
        status: step.status
      }
    });

    await step.destroy({ transaction: t });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return { deleted: true };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

module.exports = {
  createTask,
  updateTask,
  getTasksForWinery,
  getTaskById,
  createTaskStep,
  updateTaskStep,
  deleteTaskStep,
  updateNotePrivacy
};

/**
 * Toggle the isPrivate flag on an existing NOTE_ADDED TaskAction.
 * Only the note author or a manager/admin can toggle.
 */
async function updateNotePrivacy({ taskId, actionId, wineryId, userId, userRole, isPrivate }) {
  const { TaskAction } = require('../models');

  // Verify the task belongs to this winery
  const task = await Task.findOne({ where: { id: taskId, wineryId } });
  if (!task) throw new Error('Task not found');

  const action = await TaskAction.findOne({
    where: { id: actionId, taskId, actionType: 'NOTE_ADDED' }
  });
  if (!action) throw new Error('Task Action not found');

  // Only the author or a manager/admin can toggle privacy
  if (action.userId !== userId && userRole === 'staff') {
    const err = new Error('Only the note author or a manager can change note privacy.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const details = action.details || {};
  details.isPrivate = isPrivate;
  action.details = details;
  action.changed('details', true); // Force Sequelize to detect JSON change
  await action.save();

  logger.info('Note privacy toggled', { actionId, taskId, isPrivate, userId });
  return action;
}

/**
 * Helper to process text for user mentions
 */
async function processMentions({ text, wineryId, senderId, taskId, transaction }) {
  if (!text || !text.includes('@')) return;

  const users = await User.findAll({
    where: { wineryId },
    attributes: ['id', 'displayName']
  });

  for (const user of users) {
    if (user.id === senderId) continue;
    if (!user.displayName) continue;

    // Case-insensitive match for @DisplayName
    // Assuming simple names for now. If displayName has spaces, we check inclusion.
    const mentionPattern = new RegExp(`@${user.displayName}\\b`, 'i');

    if (mentionPattern.test(text)) {
      await Notification.create({
        userId: user.id,
        type: 'MENTION',
        message: `You were mentioned in a task note`,
        data: { taskId }
      }, { transaction });
    }
  }
}
