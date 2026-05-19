const { Task, Notification, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

const HOUR_MS = 60 * 60 * 1000;
const CLOSED_TASK_STATUSES = new Set(['ACTIONED', 'REJECTED']);

function positiveIntegerFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getDeadlineConfig() {
  return {
    dueSoonHours: positiveIntegerFromEnv('TASK_DEADLINE_DUE_SOON_HOURS', 48),
    overdueRepeatHours: positiveIntegerFromEnv('TASK_DEADLINE_OVERDUE_REPEAT_HOURS', 24),
    managerEscalationHours: positiveIntegerFromEnv('TASK_DEADLINE_MANAGER_ESCALATION_HOURS', 24),
    schedulerIntervalMs: positiveIntegerFromEnv('TASK_DEADLINE_SCHEDULER_INTERVAL_MS', 15 * 60 * 1000),
    batchSize: positiveIntegerFromEnv('TASK_DEADLINE_BATCH_SIZE', 100)
  };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundHours(ms) {
  return Math.round((ms / HOUR_MS) * 10) / 10;
}

function isOpenTask(task) {
  return task?.status === 'PENDING' && !CLOSED_TASK_STATUSES.has(task.status);
}

function getDeadlineState(task, now = new Date(), options = {}) {
  const dueAt = toDate(task?.dueAt);
  const dueSoonHours = options.dueSoonHours || getDeadlineConfig().dueSoonHours;

  if (!isOpenTask(task) || !dueAt) {
    return {
      deadlineState: 'NONE',
      isOverdue: false,
      isDueSoon: false,
      dueAt: dueAt ? dueAt.toISOString() : null,
      hoursUntilDue: null,
      overdueHours: null,
      deadlineSortRank: 3,
      effectiveUrgency: 'normal'
    };
  }

  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs < 0) {
    return {
      deadlineState: 'OVERDUE',
      isOverdue: true,
      isDueSoon: false,
      dueAt: dueAt.toISOString(),
      hoursUntilDue: 0,
      overdueHours: roundHours(Math.abs(diffMs)),
      deadlineSortRank: 0,
      effectiveUrgency: 'overdue'
    };
  }

  if (diffMs <= dueSoonHours * HOUR_MS) {
    return {
      deadlineState: 'DUE_SOON',
      isOverdue: false,
      isDueSoon: true,
      dueAt: dueAt.toISOString(),
      hoursUntilDue: roundHours(diffMs),
      overdueHours: null,
      deadlineSortRank: 1,
      effectiveUrgency: 'due_soon'
    };
  }

  return {
    deadlineState: 'SCHEDULED',
    isOverdue: false,
    isDueSoon: false,
    dueAt: dueAt.toISOString(),
    hoursUntilDue: roundHours(diffMs),
    overdueHours: null,
    deadlineSortRank: 2,
    effectiveUrgency: 'normal'
  };
}

function attachDeadlineState(task, now = new Date(), options = {}) {
  if (!task) return task;
  const plainTask = typeof task.toJSON === 'function' ? task.toJSON() : { ...task };
  return {
    ...plainTask,
    ...getDeadlineState(plainTask, now, options)
  };
}

function getTaskId(task) {
  return Number(task?.id);
}

function getDueAtKey(task) {
  const dueAt = toDate(task?.dueAt);
  return dueAt ? dueAt.toISOString() : 'no-due-at';
}

function getOverdueRepeatBucket(now) {
  const config = getDeadlineConfig();
  const bucketSizeMs = config.overdueRepeatHours * HOUR_MS;
  return Math.floor(now.getTime() / bucketSizeMs);
}

function buildReminderKey(task, kind, now = new Date()) {
  const base = `task-deadline:${getTaskId(task)}:${getDueAtKey(task)}:${kind}`;
  if (kind === 'OVERDUE') {
    return `${base}:${getOverdueRepeatBucket(now)}`;
  }
  return base;
}

async function findManagerUserId(wineryId, transaction) {
  if (!wineryId) return null;
  const manager = await User.findOne({
    where: { wineryId, role: 'manager' },
    transaction
  });
  return manager?.id || null;
}

async function resolveReminderRecipient(task, transaction) {
  return task.assigneeId || await findManagerUserId(task.wineryId, transaction);
}

async function notificationExists({ userId, reminderKey, transaction }) {
  const notifications = await Notification.findAll({
    where: {
      userId,
      type: 'SYSTEM'
    },
    transaction
  });

  return notifications.some(notification => notification.data?.reminderKey === reminderKey);
}

async function createNotificationIfMissing({ userId, message, data, transaction }) {
  if (!userId || !data?.reminderKey) return null;

  const alreadyExists = await notificationExists({
    userId,
    reminderKey: data.reminderKey,
    transaction
  });

  if (alreadyExists) return null;

  return Notification.create({
    userId,
    type: 'SYSTEM',
    message,
    data
  }, { transaction });
}

function buildDueSoonMessage(task) {
  return task.assigneeId
    ? `Task #${task.id} is approaching its deadline.`
    : `Unassigned task #${task.id} is approaching its deadline.`;
}

function buildOverdueMessage(task) {
  return task.assigneeId
    ? `Task #${task.id} has passed its deadline.`
    : `Unassigned task #${task.id} has passed its deadline.`;
}

function buildEscalationMessage(task, overdueHours) {
  const roundedHours = Math.max(1, Math.round(overdueHours || 0));
  return `Task #${task.id} is overdue by ${roundedHours} hour${roundedHours === 1 ? '' : 's'} and needs manager review.`;
}

async function notifyDueSoon({ task, state, now, transaction }) {
  const userId = await resolveReminderRecipient(task, transaction);
  if (!userId) return null;

  const reminderKey = buildReminderKey(task, 'DUE_SOON', now);
  return createNotificationIfMissing({
    userId,
    message: buildDueSoonMessage(task),
    data: {
      taskId: task.id,
      reminderKind: 'DUE_SOON',
      reminderKey,
      deadlineState: state.deadlineState,
      dueAt: state.dueAt,
      hoursUntilDue: state.hoursUntilDue
    },
    transaction
  });
}

async function notifyOverdue({ task, state, now, transaction }) {
  const userId = await resolveReminderRecipient(task, transaction);
  if (!userId) return null;

  const reminderKey = buildReminderKey(task, 'OVERDUE', now);
  return createNotificationIfMissing({
    userId,
    message: buildOverdueMessage(task),
    data: {
      taskId: task.id,
      reminderKind: 'OVERDUE',
      reminderKey,
      deadlineState: state.deadlineState,
      dueAt: state.dueAt,
      overdueHours: state.overdueHours
    },
    transaction
  });
}

async function notifyManagerEscalation({ task, state, now, transaction }) {
  const config = getDeadlineConfig();
  if (!state.isOverdue || state.overdueHours < config.managerEscalationHours) {
    return null;
  }

  const managerUserId = await findManagerUserId(task.wineryId, transaction);
  if (!managerUserId || Number(managerUserId) === Number(task.assigneeId)) {
    return null;
  }

  const reminderKey = buildReminderKey(task, 'MANAGER_ESCALATION', now);
  return createNotificationIfMissing({
    userId: managerUserId,
    message: buildEscalationMessage(task, state.overdueHours),
    data: {
      taskId: task.id,
      assigneeId: task.assigneeId || null,
      reminderKind: 'MANAGER_ESCALATION',
      reminderKey,
      deadlineState: state.deadlineState,
      dueAt: state.dueAt,
      overdueHours: state.overdueHours
    },
    transaction
  });
}

function getDeadlineOrderExpression(sequelize = Task.sequelize, options = {}) {
  const config = getDeadlineConfig();
  const dueSoonHours = Number(options.dueSoonHours || config.dueSoonHours);
  const safeDueSoonHours = Number.isInteger(dueSoonHours) && dueSoonHours > 0 ? dueSoonHours : config.dueSoonHours;
  const dialect = typeof sequelize?.getDialect === 'function' ? sequelize.getDialect() : 'mysql';

  if (dialect === 'sqlite') {
    return `CASE
      WHEN "Task"."status" = 'PENDING' AND "Task"."dueAt" IS NOT NULL AND "Task"."dueAt" < CURRENT_TIMESTAMP THEN 0
      WHEN "Task"."status" = 'PENDING' AND "Task"."dueAt" IS NOT NULL AND "Task"."dueAt" <= datetime(CURRENT_TIMESTAMP, '+${safeDueSoonHours} hours') THEN 1
      WHEN "Task"."status" = 'PENDING' AND "Task"."dueAt" IS NOT NULL THEN 2
      ELSE 3
    END`;
  }

  return `CASE
    WHEN \`Task\`.\`status\` = 'PENDING' AND \`Task\`.\`dueAt\` IS NOT NULL AND \`Task\`.\`dueAt\` < CURRENT_TIMESTAMP THEN 0
    WHEN \`Task\`.\`status\` = 'PENDING' AND \`Task\`.\`dueAt\` IS NOT NULL AND \`Task\`.\`dueAt\` <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${safeDueSoonHours} HOUR) THEN 1
    WHEN \`Task\`.\`status\` = 'PENDING' AND \`Task\`.\`dueAt\` IS NOT NULL THEN 2
    ELSE 3
  END`;
}

function getOpenTaskDueAtOrderExpression(sequelize = Task.sequelize) {
  const dialect = typeof sequelize?.getDialect === 'function' ? sequelize.getDialect() : 'mysql';

  if (dialect === 'sqlite') {
    return `CASE
      WHEN "Task"."status" = 'PENDING' AND "Task"."dueAt" IS NOT NULL THEN "Task"."dueAt"
      ELSE NULL
    END`;
  }

  return `CASE
    WHEN \`Task\`.\`status\` = 'PENDING' AND \`Task\`.\`dueAt\` IS NOT NULL THEN \`Task\`.\`dueAt\`
    ELSE NULL
  END`;
}

async function sendTaskDeadlineReminders(options = {}) {
  const config = getDeadlineConfig();
  const now = options.now || new Date();
  const dueSoonHours = options.dueSoonHours || config.dueSoonHours;
  const dueSoonCutoff = new Date(now.getTime() + dueSoonHours * HOUR_MS);
  const transaction = options.transaction;

  const tasks = await Task.findAll({
    where: {
      status: 'PENDING',
      dueAt: {
        [Op.ne]: null,
        [Op.lte]: dueSoonCutoff
      }
    },
    order: [['dueAt', 'ASC'], ['id', 'ASC']],
    limit: options.batchSize || config.batchSize,
    transaction
  });

  const createdNotifications = [];

  for (const task of tasks) {
    const plainTask = typeof task.toJSON === 'function' ? task.toJSON() : task;
    const state = getDeadlineState(plainTask, now, { dueSoonHours });

    if (state.isOverdue) {
      const overdueNotification = await notifyOverdue({ task: plainTask, state, now, transaction });
      if (overdueNotification) createdNotifications.push(overdueNotification);

      const escalationNotification = await notifyManagerEscalation({ task: plainTask, state, now, transaction });
      if (escalationNotification) createdNotifications.push(escalationNotification);
    } else if (state.isDueSoon) {
      const dueSoonNotification = await notifyDueSoon({ task: plainTask, state, now, transaction });
      if (dueSoonNotification) createdNotifications.push(dueSoonNotification);
    }
  }

  return {
    scanned: tasks.length,
    created: createdNotifications.length,
    notifications: createdNotifications
  };
}

function startDeadlineReminderScheduler(options = {}) {
  if (process.env.TASK_DEADLINE_REMINDERS_ENABLED === 'false') {
    logger.info('Task deadline reminder scheduler disabled.');
    return null;
  }

  const config = getDeadlineConfig();
  const intervalMs = options.intervalMs || config.schedulerIntervalMs;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const result = await sendTaskDeadlineReminders();
      if (result.created > 0) {
        logger.info('Task deadline reminders created.', {
          scanned: result.scanned,
          created: result.created
        });
      }
    } catch (err) {
      logger.error('Task deadline reminder scheduler failed', {
        error: err.message
      });
    } finally {
      running = false;
    }
  };

  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  if (options.runImmediately) setImmediate(run);

  logger.info('Task deadline reminder scheduler started.', { intervalMs });

  return {
    stop: () => clearInterval(interval),
    run
  };
}

module.exports = {
  getDeadlineConfig,
  getDeadlineState,
  attachDeadlineState,
  getDeadlineOrderExpression,
  getOpenTaskDueAtOrderExpression,
  buildReminderKey,
  sendTaskDeadlineReminders,
  startDeadlineReminderScheduler
};
