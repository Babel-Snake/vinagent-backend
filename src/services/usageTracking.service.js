const crypto = require('crypto');
const { Op, fn, col } = require('sequelize');
const logger = require('../config/logger');
const { METRICS, METRIC_DEFINITIONS, ROUTE_GROUPS } = require('./usageMetricCatalog');

const EMPTY_DIMENSIONS_KEY = crypto.createHash('sha256').update('{}').digest('hex');
const MAX_DIMENSION_VALUE_LENGTH = 80;
const SAFE_DIMENSION_VALUE = /^[A-Za-z0-9_.:-]+$/;

function resolveModels(models) {
  return models || require('../models');
}

function usageError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw usageError('USAGE_VALIDATION_ERROR', `${field} must be a positive integer.`);
  return number;
}

function finiteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw usageError('USAGE_VALIDATION_ERROR', `${field} must be non-negative.`);
  return number;
}

function validDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw usageError('USAGE_VALIDATION_ERROR', `${field} must be a valid date.`);
  return date;
}

function sanitizeDimensions(metricKey, input = {}) {
  const definition = METRIC_DEFINITIONS[metricKey];
  if (!definition) throw usageError('USAGE_METRIC_UNKNOWN', `Unknown usage metric '${metricKey}'.`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return [...definition.dimensions].sort().reduce((result, key) => {
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] === null || input[key] === undefined) return result;
    const value = input[key];
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw usageError('USAGE_DIMENSION_INVALID', `Usage dimension '${key}' must be scalar.`);
    }
    const normalized = String(value).trim().slice(0, MAX_DIMENSION_VALUE_LENGTH);
    if (normalized && !SAFE_DIMENSION_VALUE.test(normalized)) {
      throw usageError('USAGE_DIMENSION_INVALID', `Usage dimension '${key}' contains unsupported characters.`);
    }
    if (normalized) result[key] = normalized;
    return result;
  }, {});
}

function dimensionsIdentity(dimensions) {
  const serialized = JSON.stringify(dimensions);
  return {
    serialized,
    key: crypto.createHash('sha256').update(serialized).digest('hex')
  };
}

function localDateFor(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hourBucket(date = new Date()) {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

function isUniqueError(error) {
  return error?.name === 'SequelizeUniqueConstraintError';
}

async function recordUsageEvent({
  wineryId,
  actorUserId = null,
  metricKey,
  quantity = 1,
  occurredAt = new Date(),
  sourceType,
  sourceId = null,
  idempotencyKey,
  dimensions = {},
  transaction = null,
  models = null
}) {
  models = resolveModels(models);
  const normalizedWineryId = positiveInteger(wineryId, 'wineryId');
  const normalizedActor = actorUserId === null || actorUserId === undefined ? null : positiveInteger(actorUserId, 'actorUserId');
  const definition = METRIC_DEFINITIONS[metricKey];
  if (!definition) throw usageError('USAGE_METRIC_UNKNOWN', `Unknown usage metric '${metricKey}'.`);
  const normalizedQuantity = finiteNonNegative(quantity, 'quantity');
  const normalizedOccurredAt = validDate(occurredAt, 'occurredAt');
  const normalizedSourceType = String(sourceType || '').trim().slice(0, 48);
  const normalizedSourceId = sourceId === null || sourceId === undefined ? null : String(sourceId).trim().slice(0, 191);
  const normalizedIdempotencyKey = String(idempotencyKey || '').trim().slice(0, 191);
  if (!normalizedSourceType || !normalizedIdempotencyKey) {
    throw usageError('USAGE_VALIDATION_ERROR', 'sourceType and idempotencyKey are required.');
  }
  const safeDimensions = sanitizeDimensions(metricKey, dimensions);
  const where = { wineryId: normalizedWineryId, idempotencyKey: normalizedIdempotencyKey };
  const existing = await models.UsageEvent.findOne({ where, transaction });
  if (existing) return { event: existing, duplicate: true };

  try {
    const event = await models.UsageEvent.create({
      id: crypto.randomUUID(),
      wineryId: normalizedWineryId,
      actorUserId: normalizedActor,
      metricKey,
      schemaVersion: 1,
      quantity: normalizedQuantity,
      unit: definition.unit,
      occurredAt: normalizedOccurredAt,
      sourceType: normalizedSourceType,
      sourceId: normalizedSourceId,
      idempotencyKey: normalizedIdempotencyKey,
      dimensions: safeDimensions
    }, { transaction });
    return { event, duplicate: false };
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const duplicate = await models.UsageEvent.findOne({ where, transaction });
    if (!duplicate) throw error;
    return { event: duplicate, duplicate: true };
  }
}

async function safeRecordUsageEvent(options) {
  try {
    return await recordUsageEvent(options);
  } catch (error) {
    const log = typeof logger.error === 'function' ? logger.error.bind(logger) : () => {};
    log('Usage event recording failed.', {
      metricKey: options.metricKey || null,
      wineryId: options.wineryId || null,
      code: error.code || null,
      error: error.message
    });
    return { event: null, duplicate: false, failed: true };
  }
}

async function incrementUsageCounter({
  wineryId,
  metricKey,
  occurredAt = new Date(),
  dimensions = {},
  quantity = 1,
  durationMs = 0,
  responseBytes = 0,
  models = null
}) {
  models = resolveModels(models);
  const normalizedWineryId = positiveInteger(wineryId, 'wineryId');
  if (metricKey !== METRICS.API_REQUESTS) throw usageError('USAGE_COUNTER_UNSUPPORTED');
  const safeDimensions = sanitizeDimensions(metricKey, dimensions);
  const identity = dimensionsIdentity(safeDimensions);
  const bucketStart = hourBucket(validDate(occurredAt, 'occurredAt'));
  const where = { wineryId: normalizedWineryId, metricKey, bucketStart, dimensionsKey: identity.key };

  await models.UsageCounterBucket.findOrCreate({
    where,
    defaults: {
      ...where,
      bucketSeconds: 3600,
      dimensions: safeDimensions,
      eventCount: 0,
      quantity: 0,
      durationMs: 0,
      responseBytes: 0
    }
  });
  await models.UsageCounterBucket.increment({
    eventCount: 1,
    quantity: finiteNonNegative(quantity, 'quantity'),
    durationMs: Math.round(finiteNonNegative(durationMs, 'durationMs')),
    responseBytes: Math.round(finiteNonNegative(responseBytes, 'responseBytes'))
  }, { where });
  return models.UsageCounterBucket.findOne({ where });
}

async function getWineryTimeZone(wineryId, models, transaction = null) {
  const winery = await models.Winery.findOne({
    where: { id: wineryId },
    attributes: ['id', 'timeZone'],
    transaction
  });
  if (!winery) throw usageError('WINERY_NOT_FOUND');
  return winery.timeZone || 'UTC';
}

async function recordActivityHeartbeat({
  wineryId,
  userId,
  authMode = 'firebase',
  sessionId,
  sequence,
  engagedSeconds,
  routeGroup = 'other',
  occurredAt = new Date(),
  models = null
}) {
  models = resolveModels(models);
  const normalizedSessionId = String(sessionId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalizedSessionId)) {
    throw usageError('USAGE_ACTIVITY_INVALID', 'sessionId must be a UUID.');
  }
  const normalizedSequence = Number(sequence);
  if (!Number.isInteger(normalizedSequence) || normalizedSequence < 0 || normalizedSequence > 1_000_000) {
    throw usageError('USAGE_ACTIVITY_INVALID', 'sequence is invalid.');
  }
  const seconds = Math.min(Math.round(finiteNonNegative(engagedSeconds, 'engagedSeconds')), 60);
  const safeRouteGroup = ROUTE_GROUPS.has(routeGroup) ? routeGroup : 'other';
  const eventAt = validDate(occurredAt, 'occurredAt');

  return models.sequelize.transaction(async transaction => {
    const timeZone = await getWineryTimeZone(wineryId, models, transaction);
    const eventResult = await recordUsageEvent({
      wineryId,
      actorUserId: userId,
      metricKey: METRICS.USER_ENGAGED_SECONDS,
      quantity: seconds,
      occurredAt: eventAt,
      sourceType: 'activity_session',
      sourceId: normalizedSessionId,
      idempotencyKey: `activity:${userId}:${normalizedSessionId}:${normalizedSequence}`,
      dimensions: { routeGroup: safeRouteGroup, authMode },
      transaction,
      models
    });
    if (eventResult.duplicate) return { duplicate: true, acceptedSeconds: 0 };

    const activityDate = localDateFor(timeZone, eventAt);
    const where = { wineryId: Number(wineryId), userId: Number(userId), activityDate };
    await models.UserActivityDaily.findOrCreate({
      where,
      defaults: {
        ...where,
        engagedSeconds: 0,
        sessionCount: 0,
        requestCount: 0,
        lastActiveAt: eventAt
      },
      transaction
    });
    await models.UserActivityDaily.increment({
      engagedSeconds: seconds,
      sessionCount: normalizedSequence === 0 ? 1 : 0
    }, { where, transaction });
    await models.UserActivityDaily.update({ lastActiveAt: eventAt }, { where, transaction });
    return { duplicate: false, acceptedSeconds: seconds };
  });
}

async function ensureBillingProfile(wineryId, models = null, transaction = null) {
  models = resolveModels(models);
  const [profile] = await models.WineryBillingProfile.findOrCreate({
    where: { wineryId },
    defaults: {
      wineryId,
      lifecycleStatus: 'PILOT',
      planCode: 'pilot',
      billingProvider: 'none',
      meteringStartedAt: new Date()
    },
    transaction
  });
  return profile;
}

async function captureGaugeSnapshots({ wineryId, capturedAt = new Date(), models = null }) {
  models = resolveModels(models);
  const normalizedWineryId = positiveInteger(wineryId, 'wineryId');
  const timeZone = await getWineryTimeZone(normalizedWineryId, models);
  const snapshotDate = localDateFor(timeZone, capturedAt);
  const [activeSeats, storageBytes, activeMembers] = await Promise.all([
    models.User.count({ where: { wineryId: normalizedWineryId, isActive: true } }),
    models.Attachment.sum('sizeBytes', { where: { wineryId: normalizedWineryId, deletedAt: null } }),
    models.Member.count({ where: { wineryId: normalizedWineryId } })
  ]);
  const gauges = [
    [METRICS.ACTIVE_SEATS, Number(activeSeats || 0)],
    [METRICS.ATTACHMENT_STORAGE_BYTES, Number(storageBytes || 0)],
    [METRICS.ACTIVE_MEMBERS, Number(activeMembers || 0)]
  ];

  await ensureBillingProfile(normalizedWineryId, models);
  for (const [metricKey, value] of gauges) {
    await models.UsageGaugeSnapshot.upsert({
      wineryId: normalizedWineryId,
      metricKey,
      snapshotDate,
      value,
      unit: METRIC_DEFINITIONS[metricKey].unit,
      dimensionsKey: EMPTY_DIMENSIONS_KEY,
      dimensions: {},
      capturedAt
    });
  }
  return { snapshotDate, activeSeats: Number(activeSeats || 0), storageBytes: Number(storageBytes || 0), activeMembers: Number(activeMembers || 0) };
}

function normalizeWindow(start, end, maximumDays = 366) {
  const resolvedEnd = end ? validDate(end, 'end') : new Date();
  const resolvedStart = start ? validDate(start, 'start') : new Date(resolvedEnd.getTime() - 30 * 86400000);
  if (resolvedStart >= resolvedEnd || resolvedEnd.getTime() - resolvedStart.getTime() > maximumDays * 86400000) {
    throw usageError('USAGE_WINDOW_INVALID', `Usage windows must be positive and no longer than ${maximumDays} days.`);
  }
  return { start: resolvedStart, end: resolvedEnd };
}

async function getUsageSummary({ wineryId, start, end, models = null }) {
  models = resolveModels(models);
  const normalizedWineryId = positiveInteger(wineryId, 'wineryId');
  const window = normalizeWindow(start, end);
  const range = { [Op.gte]: window.start, [Op.lt]: window.end };
  const [profile, activeSeats, storageBytes, members, tasksCreated, inboundMessages, outboundMessages, engagedSeconds, activeUsers, sessions, eventRows, counterRows, gaugeHistory] = await Promise.all([
    models.WineryBillingProfile.findOne({ where: { wineryId: normalizedWineryId } }),
    models.User.count({ where: { wineryId: normalizedWineryId, isActive: true } }),
    models.Attachment.sum('sizeBytes', { where: { wineryId: normalizedWineryId, deletedAt: null } }),
    models.Member.count({ where: { wineryId: normalizedWineryId } }),
    models.Task.count({ where: { wineryId: normalizedWineryId, createdAt: range } }),
    models.Message.count({ where: { wineryId: normalizedWineryId, direction: 'inbound', createdAt: range } }),
    models.Message.count({ where: { wineryId: normalizedWineryId, direction: 'outbound', createdAt: range } }),
    models.UsageEvent.sum('quantity', {
      where: { wineryId: normalizedWineryId, metricKey: METRICS.USER_ENGAGED_SECONDS, occurredAt: range }
    }),
    models.UsageEvent.count({
      where: { wineryId: normalizedWineryId, metricKey: METRICS.USER_ENGAGED_SECONDS, occurredAt: range },
      distinct: true,
      col: 'actorUserId'
    }),
    models.UsageEvent.count({
      where: { wineryId: normalizedWineryId, metricKey: METRICS.USER_ENGAGED_SECONDS, occurredAt: range },
      distinct: true,
      col: 'sourceId'
    }),
    models.UsageEvent.findAll({
      where: { wineryId: normalizedWineryId, occurredAt: range },
      attributes: ['metricKey', [fn('SUM', col('quantity')), 'quantity'], [fn('COUNT', col('id')), 'eventCount']],
      group: ['metricKey']
    }),
    models.UsageCounterBucket.findAll({
      where: { wineryId: normalizedWineryId, bucketStart: range },
      attributes: ['metricKey', [fn('SUM', col('eventCount')), 'eventCount'], [fn('SUM', col('durationMs')), 'durationMs']],
      group: ['metricKey']
    }),
    models.UsageGaugeSnapshot.findAll({
      where: {
        wineryId: normalizedWineryId,
        snapshotDate: { [Op.between]: [window.start.toISOString().slice(0, 10), window.end.toISOString().slice(0, 10)] }
      },
      attributes: ['metricKey', 'snapshotDate', 'value', 'unit'],
      order: [['snapshotDate', 'ASC'], ['metricKey', 'ASC']]
    })
  ]);

  const eventMetrics = Object.fromEntries(eventRows.map(row => [row.metricKey, {
    quantity: Number(row.get('quantity') || 0),
    eventCount: Number(row.get('eventCount') || 0)
  }]));
  const counterMetrics = Object.fromEntries(counterRows.map(row => [row.metricKey, {
    eventCount: Number(row.get('eventCount') || 0),
    durationMs: Number(row.get('durationMs') || 0)
  }]));

  return {
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    commercial: profile ? {
      lifecycleStatus: profile.lifecycleStatus,
      planCode: profile.planCode,
      billingProvider: profile.billingProvider,
      trialStartedAt: profile.trialStartedAt,
      trialEndsAt: profile.trialEndsAt,
      currentPeriodStart: profile.currentPeriodStart,
      currentPeriodEnd: profile.currentPeriodEnd,
      meteringStartedAt: profile.meteringStartedAt
    } : null,
    current: {
      activeSeats: Number(activeSeats || 0),
      storageBytes: Number(storageBytes || 0),
      members: Number(members || 0)
    },
    activity: {
      activeUsers: Number(activeUsers || 0),
      engagedSeconds: Number(engagedSeconds || 0),
      sessions: Number(sessions || 0)
    },
    operations: {
      tasksCreated: Number(tasksCreated || 0),
      inboundMessages: Number(inboundMessages || 0),
      outboundMessages: Number(outboundMessages || 0)
    },
    eventMetrics,
    counterMetrics,
    gaugeHistory: gaugeHistory.map(row => ({
      metricKey: row.metricKey,
      snapshotDate: row.snapshotDate,
      value: Number(row.value),
      unit: row.unit
    }))
  };
}

async function runUsageReconciliation({ wineryId, start, end, models = null }) {
  models = resolveModels(models);
  const normalizedWineryId = positiveInteger(wineryId, 'wineryId');
  const profile = await ensureBillingProfile(normalizedWineryId, models);
  const requestedWindow = normalizeWindow(start || profile.meteringStartedAt, end);
  const effectiveStart = new Date(Math.max(requestedWindow.start.getTime(), new Date(profile.meteringStartedAt).getTime()));
  const range = { [Op.gte]: effectiveStart, [Op.lt]: requestedWindow.end };
  const [sourceTaskCount, sourceInboundCount, sourceOutboundCount, eventRows, gauges] = await Promise.all([
    models.Task.count({ where: { wineryId: normalizedWineryId, createdAt: range } }),
    models.Message.count({ where: { wineryId: normalizedWineryId, direction: 'inbound', createdAt: range } }),
    models.Message.count({ where: { wineryId: normalizedWineryId, direction: 'outbound', createdAt: range } }),
    models.UsageEvent.findAll({
      where: { wineryId: normalizedWineryId, occurredAt: range },
      attributes: ['metricKey', [fn('SUM', col('quantity')), 'quantity']],
      group: ['metricKey']
    }),
    captureGaugeSnapshots({ wineryId: normalizedWineryId, models })
  ]);
  const ledger = Object.fromEntries(eventRows.map(row => [row.metricKey, Number(row.get('quantity') || 0)]));
  const comparisons = [
    { metricKey: METRICS.TASK_CREATED, source: Number(sourceTaskCount), recorded: ledger[METRICS.TASK_CREATED] || 0 },
    { metricKey: METRICS.MESSAGE_RECEIVED, source: Number(sourceInboundCount), recorded: ledger[METRICS.MESSAGE_RECEIVED] || 0 },
    { metricKey: METRICS.MESSAGE_SENT, source: Number(sourceOutboundCount), recorded: ledger[METRICS.MESSAGE_SENT] || 0 }
  ].map(item => ({ ...item, difference: item.recorded - item.source, matches: item.recorded === item.source }));

  return {
    status: comparisons.every(item => item.matches) ? 'ok' : 'discrepancy',
    window: { start: effectiveStart.toISOString(), end: requestedWindow.end.toISOString() },
    comparisons,
    gauges
  };
}

async function captureAllWinerySnapshots(models = null) {
  models = resolveModels(models);
  const wineries = await models.Winery.findAll({ attributes: ['id'] });
  const results = [];
  for (const winery of wineries) {
    try {
      results.push(await captureGaugeSnapshots({ wineryId: winery.id, models }));
    } catch (error) {
      logger.error('Usage gauge snapshot failed.', {
        wineryId: winery.id,
        code: error.code || null,
        error: error.message
      });
    }
  }
  return results;
}

function startUsageSnapshotScheduler(models = null) {
  models = resolveModels(models);
  if (process.env.NODE_ENV === 'test' && process.env.USAGE_SCHEDULER_IN_TEST !== 'true') return null;
  const intervalMs = Math.max(Number(process.env.USAGE_SNAPSHOT_INTERVAL_MS) || 3600000, 60000);
  captureAllWinerySnapshots(models).catch(() => {});
  const handle = setInterval(() => captureAllWinerySnapshots(models).catch(() => {}), intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}

module.exports = {
  EMPTY_DIMENSIONS_KEY,
  captureAllWinerySnapshots,
  captureGaugeSnapshots,
  getUsageSummary,
  incrementUsageCounter,
  localDateFor,
  normalizeWindow,
  recordActivityHeartbeat,
  recordUsageEvent,
  runUsageReconciliation,
  safeRecordUsageEvent,
  sanitizeDimensions,
  startUsageSnapshotScheduler
};
