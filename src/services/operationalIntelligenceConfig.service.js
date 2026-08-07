const {
  OperationalIntelligenceConfigAuditEvent,
  User,
  WinerySettings
} = require('../models');

const DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG = Object.freeze({
  scheduler: {
    enabled: false,
    period: 'day',
    offset: 0
  },
  thresholds: {
    requestAgingOverdueCount: 1,
    requestAgingOverSevenDaysCount: 1,
    requestAgingAverageAgeHours: 72,
    classificationMinimumEvaluated: 2,
    classificationMinimumCorrected: 1,
    classificationCorrectionRate: 25,
    conversionMinimumTotal: 2,
    conversionCompletionRate: 50,
    trendMinimumDelta: 3,
    trendMinimumChangePercent: 50,
    trendWarningDelta: 10,
    noticeOutstandingCount: 1
  },
  reminders: {
    dueSoonHours: 48,
    overdueRepeatHours: 24,
    batchSize: 100
  }
});

const PERIODS = new Set(['day', 'week', 'month', 'year']);

const CONFIG_PRESETS = Object.freeze({
  default: {
    label: 'Balanced',
    description: 'Current VinAgent defaults for normal operational volume.',
    config: DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG
  },
  sensitive: {
    label: 'More sensitive',
    description: 'Surfaces smaller movements sooner for managers who want early warning.',
    config: {
      scheduler: { enabled: true, period: 'day', offset: 0 },
      thresholds: {
        ...DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG.thresholds,
        requestAgingAverageAgeHours: 48,
        classificationCorrectionRate: 15,
        conversionMinimumTotal: 1,
        trendMinimumDelta: 2,
        trendMinimumChangePercent: 25,
        noticeOutstandingCount: 1
      },
      reminders: DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG.reminders
    }
  },
  conservative: {
    label: 'Conservative',
    description: 'Reduces review noise by requiring stronger evidence before a signal is suggested.',
    config: {
      scheduler: { enabled: false, period: 'week', offset: 0 },
      thresholds: {
        ...DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG.thresholds,
        requestAgingOverdueCount: 3,
        requestAgingOverSevenDaysCount: 3,
        requestAgingAverageAgeHours: 120,
        classificationMinimumEvaluated: 5,
        classificationMinimumCorrected: 2,
        classificationCorrectionRate: 50,
        conversionMinimumTotal: 4,
        trendMinimumDelta: 6,
        trendMinimumChangePercent: 100,
        noticeOutstandingCount: 5
      },
      reminders: {
        ...DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG.reminders,
        dueSoonHours: 24
      }
    }
  }
});

const FIELD_METADATA = Object.freeze({
  'scheduler.enabled': 'Whether this winery participates when the server-level operational intelligence scheduler is enabled.',
  'scheduler.period': 'Reporting window used by scheduled materialization when no manual period is supplied.',
  'scheduler.offset': 'How many periods back the scheduler evaluates. Zero means the current period.',
  'thresholds.requestAgingOverdueCount': 'Minimum overdue pending Requests required before creating a Request-aging signal.',
  'thresholds.requestAgingOverSevenDaysCount': 'Minimum pending Requests older than seven days required before creating a Request-aging signal.',
  'thresholds.requestAgingAverageAgeHours': 'Average pending Request age, in hours, that can trigger a Request-aging signal.',
  'thresholds.classificationMinimumEvaluated': 'Minimum AI-suggested classifications needed before correction-rate signals are considered.',
  'thresholds.classificationMinimumCorrected': 'Minimum human corrections needed before correction-rate signals are considered.',
  'thresholds.classificationCorrectionRate': 'Correction percentage required before classification quality is flagged.',
  'thresholds.conversionMinimumTotal': 'Minimum generated Tasks from Requests/Notes before conversion outcomes are evaluated.',
  'thresholds.conversionCompletionRate': 'Completion percentage below which generated Task outcomes are flagged.',
  'thresholds.trendMinimumDelta': 'Minimum increase in object count before a trend signal is considered.',
  'thresholds.trendMinimumChangePercent': 'Minimum percentage increase before a trend signal is considered.',
  'thresholds.trendWarningDelta': 'Delta at which trend signals move from info to warning severity.',
  'thresholds.noticeOutstandingCount': 'Minimum outstanding acknowledgements before notice acknowledgement signals are suggested.',
  'reminders.dueSoonHours': 'How far ahead review due reminders are created.',
  'reminders.overdueRepeatHours': 'How often overdue review reminders can repeat.',
  'reminders.batchSize': 'Maximum signal-review reminders created in one scheduler pass.'
});

function integer(value, fallback, { min = 0, max = 10000 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const scheduler = source.scheduler && typeof source.scheduler === 'object' ? source.scheduler : {};
  const thresholds = source.thresholds && typeof source.thresholds === 'object' ? source.thresholds : {};
  const reminders = source.reminders && typeof source.reminders === 'object' ? source.reminders : {};
  const defaults = DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG;
  const period = PERIODS.has(scheduler.period) ? scheduler.period : defaults.scheduler.period;

  return {
    scheduler: {
      enabled: bool(scheduler.enabled, defaults.scheduler.enabled),
      period,
      offset: integer(scheduler.offset, defaults.scheduler.offset, { min: 0, max: 52 })
    },
    thresholds: {
      requestAgingOverdueCount: integer(thresholds.requestAgingOverdueCount, defaults.thresholds.requestAgingOverdueCount, { min: 0, max: 1000 }),
      requestAgingOverSevenDaysCount: integer(thresholds.requestAgingOverSevenDaysCount, defaults.thresholds.requestAgingOverSevenDaysCount, { min: 0, max: 1000 }),
      requestAgingAverageAgeHours: integer(thresholds.requestAgingAverageAgeHours, defaults.thresholds.requestAgingAverageAgeHours, { min: 1, max: 24 * 60 }),
      classificationMinimumEvaluated: integer(thresholds.classificationMinimumEvaluated, defaults.thresholds.classificationMinimumEvaluated, { min: 1, max: 10000 }),
      classificationMinimumCorrected: integer(thresholds.classificationMinimumCorrected, defaults.thresholds.classificationMinimumCorrected, { min: 1, max: 10000 }),
      classificationCorrectionRate: integer(thresholds.classificationCorrectionRate, defaults.thresholds.classificationCorrectionRate, { min: 1, max: 100 }),
      conversionMinimumTotal: integer(thresholds.conversionMinimumTotal, defaults.thresholds.conversionMinimumTotal, { min: 1, max: 10000 }),
      conversionCompletionRate: integer(thresholds.conversionCompletionRate, defaults.thresholds.conversionCompletionRate, { min: 0, max: 100 }),
      trendMinimumDelta: integer(thresholds.trendMinimumDelta, defaults.thresholds.trendMinimumDelta, { min: 1, max: 10000 }),
      trendMinimumChangePercent: integer(thresholds.trendMinimumChangePercent, defaults.thresholds.trendMinimumChangePercent, { min: 1, max: 1000 }),
      trendWarningDelta: integer(thresholds.trendWarningDelta, defaults.thresholds.trendWarningDelta, { min: 1, max: 10000 }),
      noticeOutstandingCount: integer(thresholds.noticeOutstandingCount, defaults.thresholds.noticeOutstandingCount, { min: 1, max: 10000 })
    },
    reminders: {
      dueSoonHours: integer(reminders.dueSoonHours, defaults.reminders.dueSoonHours, { min: 1, max: 24 * 30 }),
      overdueRepeatHours: integer(reminders.overdueRepeatHours, defaults.reminders.overdueRepeatHours, { min: 1, max: 24 * 30 }),
      batchSize: integer(reminders.batchSize, defaults.reminders.batchSize, { min: 1, max: 1000 })
    }
  };
}

function mergeConfig(current = {}, patch = {}) {
  const presetConfig = patch.preset && CONFIG_PRESETS[patch.preset]
    ? CONFIG_PRESETS[patch.preset].config
    : {};
  return normalizeConfig({
    scheduler: { ...(current.scheduler || {}), ...(presetConfig.scheduler || {}), ...(patch.scheduler || {}) },
    thresholds: { ...(current.thresholds || {}), ...(presetConfig.thresholds || {}), ...(patch.thresholds || {}) },
    reminders: { ...(current.reminders || {}), ...(presetConfig.reminders || {}), ...(patch.reminders || {}) }
  });
}

function getConfigPresets() {
  return Object.entries(CONFIG_PRESETS).map(([key, preset]) => ({
    key,
    label: preset.label,
    description: preset.description,
    config: normalizeConfig(preset.config)
  }));
}

function getFieldMetadata() {
  return FIELD_METADATA;
}

function changedKeys(beforeConfig, afterConfig) {
  const before = normalizeConfig(beforeConfig);
  const after = normalizeConfig(afterConfig);
  return Object.keys(FIELD_METADATA).filter(path => {
    const keys = path.split('.');
    const beforeValue = keys.reduce((value, key) => value?.[key], before);
    const afterValue = keys.reduce((value, key) => value?.[key], after);
    return beforeValue !== afterValue;
  });
}

function changedFields(beforeConfig, afterConfig) {
  const before = normalizeConfig(beforeConfig);
  const after = normalizeConfig(afterConfig);
  return Object.keys(FIELD_METADATA).map(path => {
    const keys = path.split('.');
    const beforeValue = keys.reduce((value, key) => value?.[key], before);
    const afterValue = keys.reduce((value, key) => value?.[key], after);
    return {
      path,
      section: keys[0],
      field: keys[keys.length - 1],
      beforeValue,
      afterValue,
      description: FIELD_METADATA[path]
    };
  }).filter(field => field.beforeValue !== field.afterValue);
}

async function getConfigForWinery(wineryId, { transaction = null } = {}) {
  const settings = await WinerySettings.findOne({ where: { wineryId }, transaction });
  return normalizeConfig(settings?.operationalIntelligenceConfig || {});
}

async function updateConfigForWinery(wineryId, patch, { transaction = null } = {}) {
  const [settings] = await WinerySettings.findOrCreate({ where: { wineryId }, transaction });
  const config = mergeConfig(settings.operationalIntelligenceConfig || {}, patch || {});
  await settings.update({ operationalIntelligenceConfig: config }, { transaction });
  return config;
}

async function updateConfigForWineryWithAudit(wineryId, patch, { actorUserId, transaction = null } = {}) {
  const [settings] = await WinerySettings.findOrCreate({ where: { wineryId }, transaction });
  const beforeConfig = normalizeConfig(settings.operationalIntelligenceConfig || {});
  const config = mergeConfig(settings.operationalIntelligenceConfig || {}, patch || {});
  const keys = changedKeys(beforeConfig, config);
  await settings.update({ operationalIntelligenceConfig: config }, { transaction });
  if (actorUserId && keys.length > 0) {
    await OperationalIntelligenceConfigAuditEvent.create({
      wineryId,
      actorUserId,
      eventType: 'CONFIG_UPDATED',
      preset: patch?.preset || null,
      beforeSnapshot: beforeConfig,
      afterSnapshot: config,
      changedKeys: keys,
      metadata: {
        source: 'manager_api'
      }
    }, { transaction });
  }
  return { config, changedKeys: keys };
}

async function listConfigAuditEvents(wineryId, { limit = 10 } = {}) {
  return OperationalIntelligenceConfigAuditEvent.findAll({
    where: { wineryId },
    include: [{ model: User, as: 'Actor', attributes: ['id', 'displayName', 'email', 'role'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit
  });
}

module.exports = {
  DEFAULT_OPERATIONAL_INTELLIGENCE_CONFIG,
  CONFIG_PRESETS,
  FIELD_METADATA,
  normalizeConfig,
  mergeConfig,
  getConfigPresets,
  getFieldMetadata,
  changedKeys,
  changedFields,
  getConfigForWinery,
  updateConfigForWinery,
  updateConfigForWineryWithAudit,
  listConfigAuditEvents
};
