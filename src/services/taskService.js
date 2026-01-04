const { Task, WinerySettings, Member, Message, User } = require('../models');
const { Op } = require('sequelize');
const executionService = require('./execution.service');
const logger = require('../config/logger');
const { validateStatusTransition } = require('../utils/validation');
const auditService = require('./audit.service');

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
  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const {
      status, payload, priority, notes, suggestedReplyBody,
      category, subType, sentiment, assigneeId, parentTaskId,
      suggestedChannel, suggestedReplySubject
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
    }

    // EXECUTION TRIGGER
    if (changes.status === 'APPROVED') {
      const settings = await WinerySettings.findOne({ where: { wineryId } });
      await executionService.executeTask(task, t, settings);
    }

    await t.commit();
    logger.info('Task updated', { taskId, userId, changes: Object.keys(changes) });
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
  const { status, type, priority, assignedToMe } = filters;
  const { page = 1, pageSize = 20 } = pagination;

  // Validate pagination parameters
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const whereClause = { wineryId };

  if (status) whereClause.status = status;
  if (type) whereClause.type = type;
  if (priority) whereClause.priority = priority;

  // RBAC: Staff can only see their assigned tasks or unassigned tasks
  if (userRole === 'staff') {
    whereClause[Op.or] = [
      { assigneeId: userId },
      { assigneeId: null }
    ];
  } else if (assignedToMe === 'true') {
    // Managers/Admins can filter to their own if they want
    whereClause.assigneeId = userId;
  }

  const { count, rows } = await Task.findAndCountAll({
    where: whereClause,
    include: [
      { model: Member, attributes: ['id', 'firstName', 'lastName'] },
    ],
    order: [['createdAt', 'DESC']],
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
      { model: User, as: 'Creator', attributes: ['id', 'displayName'] }
    ]
  });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return task;
}

module.exports = {
  createTask,
  updateTask,
  getTasksForWinery,
  getTaskById
};
