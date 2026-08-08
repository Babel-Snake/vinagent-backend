const { Op } = require('sequelize');
const {
  Notification,
  OperationalIntelligenceSignal,
  User,
  Winery
} = require('../models');
const logger = require('../config/logger');
const signalService = require('./operationalIntelligenceSignal.service');
const operationalIntelligenceConfig = require('./operationalIntelligenceConfig.service');

const HOUR_MS = 60 * 60 * 1000;

function positiveIntegerFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getSchedulerConfig() {
  return {
    enabled: process.env.OPERATIONAL_INTELLIGENCE_SCHEDULER_ENABLED === 'true',
    intervalMs: positiveIntegerFromEnv('OPERATIONAL_INTELLIGENCE_SCHEDULER_INTERVAL_MS', 6 * 60 * 60 * 1000),
    period: process.env.OPERATIONAL_INTELLIGENCE_SCHEDULER_PERIOD || 'day',
    offset: Number.isInteger(Number(process.env.OPERATIONAL_INTELLIGENCE_SCHEDULER_OFFSET))
      ? Number(process.env.OPERATIONAL_INTELLIGENCE_SCHEDULER_OFFSET)
      : 0,
    runImmediately: process.env.OPERATIONAL_INTELLIGENCE_SCHEDULER_RUN_IMMEDIATELY === 'true',
    reviewDueSoonHours: positiveIntegerFromEnv('OPERATIONAL_INTELLIGENCE_REVIEW_DUE_SOON_HOURS', 48),
    reviewOverdueRepeatHours: positiveIntegerFromEnv('OPERATIONAL_INTELLIGENCE_REVIEW_OVERDUE_REPEAT_HOURS', 24),
    reviewReminderBatchSize: positiveIntegerFromEnv('OPERATIONAL_INTELLIGENCE_REVIEW_REMINDER_BATCH_SIZE', 100)
  };
}

function getDateRange(period = 'day', offset = 0, now = new Date()) {
  let start;
  let end;
  switch (period) {
    case 'week': {
      const day = now.getDay() || 7;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      start = new Date(thisMonday);
      start.setDate(start.getDate() - offset * 7);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear() - offset, 0, 1);
      end = new Date(now.getFullYear() - offset + 1, 0, 1);
      break;
    case 'day':
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
  }
  return { start, end };
}

async function runScheduledMaterialization({ wineryId = null, userId = null, period = null, offset = null, start = null, end = null, now = new Date(), onlyEnabled = false } = {}) {
  const wineries = wineryId
    ? await Winery.findAll({ where: { id: wineryId }, attributes: ['id', 'name'] })
    : await Winery.findAll({ attributes: ['id', 'name'] });
  const wineryResults = [];

  for (const winery of wineries) {
    const wineryConfig = await operationalIntelligenceConfig.getConfigForWinery(winery.id);
    if (onlyEnabled && !wineryConfig.scheduler.enabled) continue;
    const effectivePeriod = period || wineryConfig.scheduler.period;
    const effectiveOffset = offset !== null && offset !== undefined ? offset : wineryConfig.scheduler.offset;
    const range = start && end ? { start: new Date(start), end: new Date(end) } : getDateRange(effectivePeriod, effectiveOffset, now);
    const result = await signalService.materializeSuggestedSignals({
      wineryId: winery.id,
      userId,
      start: range.start,
      end: range.end
    });
    wineryResults.push({
      wineryId: winery.id,
      wineryName: winery.name,
      period: effectivePeriod,
      offset: effectiveOffset,
      start: range.start,
      end: range.end,
      ...result
    });
  }

  return {
    period: period || null,
    offset: offset !== null && offset !== undefined ? offset : null,
    start: start ? new Date(start) : null,
    end: end ? new Date(end) : null,
    wineryCount: wineries.length,
    processedWineryCount: wineryResults.length,
    suggestedCount: wineryResults.reduce((sum, result) => sum + result.suggestedCount, 0),
    createdCount: wineryResults.reduce((sum, result) => sum + result.createdCount, 0),
    updatedCount: wineryResults.reduce((sum, result) => sum + result.updatedCount, 0),
    suppressedDuplicateCount: wineryResults.reduce((sum, result) => sum + (result.suppressedDuplicateCount || 0), 0),
    results: wineryResults,
    wineries: wineryResults
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

function getReviewDueState(signal, now = new Date(), options = {}) {
  const dueAt = toDate(signal?.reviewDueAt);
  const dueSoonHours = options.dueSoonHours || getSchedulerConfig().reviewDueSoonHours;

  if (!dueAt || !['OPEN', 'ACKNOWLEDGED'].includes(signal?.status)) {
    return {
      reviewDueState: 'NONE',
      isOverdue: false,
      isDueSoon: false,
      reviewDueAt: dueAt ? dueAt.toISOString() : null,
      hoursUntilDue: null,
      overdueHours: null
    };
  }

  const diffMs = dueAt.getTime() - now.getTime();
  if (diffMs < 0) {
    return {
      reviewDueState: 'OVERDUE',
      isOverdue: true,
      isDueSoon: false,
      reviewDueAt: dueAt.toISOString(),
      hoursUntilDue: 0,
      overdueHours: roundHours(Math.abs(diffMs))
    };
  }

  if (diffMs <= dueSoonHours * HOUR_MS) {
    return {
      reviewDueState: 'DUE_SOON',
      isOverdue: false,
      isDueSoon: true,
      reviewDueAt: dueAt.toISOString(),
      hoursUntilDue: roundHours(diffMs),
      overdueHours: null
    };
  }

  return {
    reviewDueState: 'SCHEDULED',
    isOverdue: false,
    isDueSoon: false,
    reviewDueAt: dueAt.toISOString(),
    hoursUntilDue: roundHours(diffMs),
    overdueHours: null
  };
}

function getSignalId(signal) {
  return Number(signal?.id);
}

function getReviewDueAtKey(signal) {
  const dueAt = toDate(signal?.reviewDueAt);
  return dueAt ? dueAt.toISOString() : 'no-review-due-at';
}

function getOverdueRepeatBucket(now, repeatHours) {
  return Math.floor(now.getTime() / (repeatHours * HOUR_MS));
}

function buildReviewReminderKey(signal, kind, now = new Date(), options = {}) {
  const repeatHours = options.overdueRepeatHours || signal?.reviewReminderConfig?.overdueRepeatHours || getSchedulerConfig().reviewOverdueRepeatHours;
  const base = `operational-intelligence-signal:${getSignalId(signal)}:${getReviewDueAtKey(signal)}:${kind}`;
  if (kind === 'OVERDUE') return `${base}:${getOverdueRepeatBucket(now, repeatHours)}`;
  return base;
}

async function findManagerUserId(wineryId, transaction) {
  if (!wineryId) return null;
  const manager = await User.findOne({
    where: { wineryId, role: 'manager', isActive: true },
    order: [['id', 'ASC']],
    transaction
  });
  return manager?.id || null;
}

async function resolveReviewReminderRecipient(signal, transaction) {
  if (signal.reviewOwnerUserId) {
    const owner = await User.findOne({
      where: { id: signal.reviewOwnerUserId, wineryId: signal.wineryId, isActive: true },
      attributes: ['id'],
      transaction
    });
    if (owner) return owner.id;
  }
  return findManagerUserId(signal.wineryId, transaction);
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
  const alreadyExists = await notificationExists({ userId, reminderKey: data.reminderKey, transaction });
  if (alreadyExists) return null;
  return Notification.create({ userId, type: 'SYSTEM', message, data }, { transaction });
}

function buildDueSoonMessage(signal) {
  return `Operational intelligence signal #${signal.id} is approaching its review due date.`;
}

function buildOverdueMessage(signal, overdueHours) {
  const roundedHours = Math.max(1, Math.round(overdueHours || 0));
  return `Operational intelligence signal #${signal.id} is overdue for review by ${roundedHours} hour${roundedHours === 1 ? '' : 's'}.`;
}

async function notifyReviewDueSoon({ signal, state, now, transaction }) {
  const userId = await resolveReviewReminderRecipient(signal, transaction);
  if (!userId) return null;
  const reminderKey = buildReviewReminderKey(signal, 'DUE_SOON', now);
  return createNotificationIfMissing({
    userId,
    message: buildDueSoonMessage(signal),
    data: {
      wineryId: signal.wineryId,
      signalId: signal.id,
      reviewOwnerUserId: signal.reviewOwnerUserId || null,
      reminderKind: 'OPERATIONAL_INTELLIGENCE_REVIEW_DUE_SOON',
      reminderKey,
      reviewDueState: state.reviewDueState,
      reviewDueAt: state.reviewDueAt,
      hoursUntilDue: state.hoursUntilDue
    },
    transaction
  });
}

async function notifyReviewOverdue({ signal, state, now, transaction }) {
  const userId = await resolveReviewReminderRecipient(signal, transaction);
  if (!userId) return null;
  const reminderKey = buildReviewReminderKey(signal, 'OVERDUE', now);
  return createNotificationIfMissing({
    userId,
    message: buildOverdueMessage(signal, state.overdueHours),
    data: {
      wineryId: signal.wineryId,
      signalId: signal.id,
      reviewOwnerUserId: signal.reviewOwnerUserId || null,
      reminderKind: 'OPERATIONAL_INTELLIGENCE_REVIEW_OVERDUE',
      reminderKey,
      reviewDueState: state.reviewDueState,
      reviewDueAt: state.reviewDueAt,
      overdueHours: state.overdueHours
    },
    transaction
  });
}

async function sendSignalReviewReminders(options = {}) {
  const config = getSchedulerConfig();
  const now = options.now || new Date();
  const wineryConfig = options.wineryId ? await operationalIntelligenceConfig.getConfigForWinery(options.wineryId) : null;
  const dueSoonHours = options.dueSoonHours || wineryConfig?.reminders?.dueSoonHours || config.reviewDueSoonHours;
  const dueSoonCutoff = new Date(now.getTime() + dueSoonHours * HOUR_MS);
  const transaction = options.transaction;
  const where = {
    status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] },
    reviewDueAt: {
      [Op.ne]: null,
      [Op.lte]: dueSoonCutoff
    }
  };
  if (options.wineryId) where.wineryId = options.wineryId;

  const signals = await OperationalIntelligenceSignal.findAll({
    where,
    order: [['reviewDueAt', 'ASC'], ['id', 'ASC']],
    limit: options.batchSize || wineryConfig?.reminders?.batchSize || config.reviewReminderBatchSize,
    transaction
  });

  const createdNotifications = [];
  for (const signalRecord of signals) {
    const signal = typeof signalRecord.toJSON === 'function' ? signalRecord.toJSON() : signalRecord;
    signal.reviewReminderConfig = {
      overdueRepeatHours: options.overdueRepeatHours || wineryConfig?.reminders?.overdueRepeatHours || config.reviewOverdueRepeatHours
    };
    const state = getReviewDueState(signal, now, { dueSoonHours });
    const notification = state.isOverdue
      ? await notifyReviewOverdue({ signal, state, now, transaction })
      : state.isDueSoon
        ? await notifyReviewDueSoon({ signal, state, now, transaction })
        : null;
    if (notification) createdNotifications.push(notification);
  }

  return {
    scanned: signals.length,
    created: createdNotifications.length,
    notifications: createdNotifications
  };
}

async function runScheduledCycle(options = {}) {
  const config = getSchedulerConfig();
  const materialization = await runScheduledMaterialization({
    wineryId: options.wineryId || null,
    userId: options.userId || null,
    period: options.period || config.period,
    offset: options.offset !== undefined ? options.offset : config.offset,
    start: options.start || null,
    end: options.end || null,
    now: options.now || new Date(),
    onlyEnabled: options.onlyEnabled !== undefined ? options.onlyEnabled : true
  });
  const reminders = await sendSignalReviewReminders({
    wineryId: options.wineryId || null,
    now: options.now || new Date(),
    dueSoonHours: options.dueSoonHours || config.reviewDueSoonHours,
    batchSize: options.batchSize || config.reviewReminderBatchSize
  });
  return { materialization, reminders };
}

function startOperationalIntelligenceScheduler(options = {}) {
  const config = getSchedulerConfig();
  const enabled = options.enabled !== undefined ? options.enabled : config.enabled;
  if (!enabled) {
    logger.info('Operational intelligence scheduler disabled.');
    return null;
  }

  const intervalMs = options.intervalMs || config.intervalMs;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runScheduledCycle(options);
      logger.info('Operational intelligence scheduler cycle complete.', {
        createdSignals: result.materialization.createdCount,
        updatedSignals: result.materialization.updatedCount,
        suppressedSignals: result.materialization.suppressedDuplicateCount,
        reviewNotifications: result.reminders.created
      });
    } catch (err) {
      logger.error('Operational intelligence scheduler failed', { error: err.message });
    } finally {
      running = false;
    }
  };

  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  if (options.runImmediately !== undefined ? options.runImmediately : config.runImmediately) setImmediate(run);

  logger.info('Operational intelligence scheduler started.', { intervalMs, period: config.period, offset: config.offset });
  return {
    stop: () => clearInterval(interval),
    run
  };
}

module.exports = {
  getSchedulerConfig,
  getDateRange,
  getReviewDueState,
  buildReviewReminderKey,
  sendSignalReviewReminders,
  runScheduledMaterialization,
  runScheduledCycle,
  startOperationalIntelligenceScheduler
};
