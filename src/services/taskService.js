const { Task, WinerySettings, Member, Message, User, TaskAction, Notification } = require('../models');
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

// Pre-approval payload validation per task type
function validatePayloadForApproval(task) {
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
async function createTask({ wineryId, userId, data }) {
  const t = await Task.sequelize.transaction();
  try {
    const {
      category, subType, customerType, type, memberId, messageId,
      payload, priority, notes, sentiment, assigneeId, parentTaskId
    } = data;

    // 1. Create Task
    const task = await Task.create({
      wineryId,
      category: category || 'INTERNAL',
      subType: subType || 'INTERNAL_TASK',
      customerType: customerType || 'UNKNOWN',
      type: subType || type || 'INTERNAL_TASK', // Legacy fallback
      status: 'PENDING_REVIEW',
      priority: priority || 'normal',
      sentiment: sentiment || 'NEUTRAL',
      payload: payload || {},
      memberId: memberId || null,
      messageId: messageId || null,
      createdBy: userId,
      updatedBy: userId,
      assigneeId: assigneeId || await determineAutoAssignee(wineryId, data),
      parentTaskId: parentTaskId || null
    }, { transaction: t });

    // 2. Log Creation Action
    await auditService.logTaskAction({
      transaction: t,
      taskId: task.id,
      userId,
      actionType: 'MANUAL_CREATED',
      details: {
        notes,
        originalText: payload?.originalText
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

    await t.commit();
    logger.info('Task created manually', { taskId: task.id, userId, wineryId });

    return task;

  } catch (err) {
    if (!t.finished) await t.rollback();
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
      suggestedChannel, suggestedReplySubject, regenerateSuggestedReply
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

    // --- LAYER 2: ROLE CHECK FOR APPROVAL ---
    if (status === 'APPROVED' && status !== task.status) {
      if (userRole === 'staff') {
        const err = new Error('Staff cannot approve tasks.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      // Validate payload has required fields before approval
      const payloadErrors = validatePayloadForApproval(task);
      if (payloadErrors.length > 0) {
        const err = new Error(`Cannot approve: ${payloadErrors.join(', ')}`);
        err.statusCode = 400;
        err.code = 'INCOMPLETE_PAYLOAD';
        throw err;
      }
    }

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
      if (changes.status === 'APPROVED') actionType = 'APPROVED';
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
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details: { note: notes }
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

    // EXECUTION TRIGGER
    if (changes.status === 'APPROVED') {
      const settings = await WinerySettings.findOne({ where: { wineryId } });
      await executionService.executeTask(task, t, settings);
    }

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
      setImmediate(() => {
        aiSuggestionService.generateAiSuggestion(task.id, wineryId, {
          force: true,
          includeHistory: true
        });
      });
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
  const { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy } = filters;
  const { page = 1, pageSize = 20 } = pagination;
  const Sequelize = require('sequelize');

  // Validate pagination parameters
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const whereClause = { wineryId };

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

module.exports = {
  createTask,
  updateTask,
  getTasksForWinery,
  getTaskById
};

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
