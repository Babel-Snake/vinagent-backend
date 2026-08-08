const {
  Notice,
  NoticeAcknowledgement,
  OperationalArea,
  OperationalItemRelation,
  OperationalRecord,
  OperationalRequest,
  Task
} = require('../models');
const { Op } = require('sequelize');
const noticeService = require('./notice.service');
const operationalIntelligenceConfig = require('./operationalIntelligenceConfig.service');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'but', 'by', 'can', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'more', 'new', 'of', 'on', 'or', 'our', 'please', 'that', 'the', 'their', 'this',
  'to', 'was', 'we', 'will', 'with', 'you', 'your'
]);

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function stem(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function significantTerms(value) {
  return [...new Set(String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map(token => stem(token.trim()))
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function similarity(left, right) {
  const a = new Set(left.terms);
  const b = new Set(right.terms);
  const intersection = [...a].filter(term => b.has(term)).length;
  const union = new Set([...a, ...b]).size;
  return { intersection, score: union ? intersection / union : 0 };
}

function detectRecurrenceClusters(items, { minimumCount = 2, maximumClusters = 10 } = {}) {
  const candidates = items
    .map(item => ({ ...item, terms: significantTerms(`${item.title || ''} ${item.text || ''}`) }))
    .filter(item => item.terms.length >= 2)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const parent = candidates.map((_, index) => index);
  const find = index => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const match = similarity(candidates[left], candidates[right]);
      if (match.intersection >= 2 && match.score >= 0.4) unite(left, right);
    }
  }

  const grouped = new Map();
  candidates.forEach((item, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(item);
  });

  return [...grouped.values()]
    .filter(group => group.length >= minimumCount)
    .map(group => {
      const termCounts = new Map();
      group.forEach(item => item.terms.forEach(term => termCounts.set(term, (termCounts.get(term) || 0) + 1)));
      const keywords = [...termCounts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([term]) => term);
      const sorted = [...group].sort((left, right) => new Date(right.eventAt) - new Date(left.eventAt));
      return {
        key: keywords.join('-'),
        keywords,
        count: group.length,
        types: [...new Set(group.map(item => item.type))].sort(),
        areaIds: [...new Set(group.flatMap(item => item.areaIds || []))].sort((a, b) => a - b),
        firstSeenAt: sorted[sorted.length - 1].eventAt,
        lastSeenAt: sorted[0].eventAt,
        examples: sorted.slice(0, 5).map(item => ({ key: item.key, type: item.type, id: item.id, title: item.title, href: item.href }))
      };
    })
    .sort((left, right) => right.count - left.count || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
    .slice(0, maximumClusters);
}

function ageHours(value, now) {
  return Math.max(0, (now.getTime() - new Date(value).getTime()) / 3600000);
}

function requestAging(requests, now) {
  const buckets = { under24Hours: 0, oneToThreeDays: 0, threeToSevenDays: 0, overSevenDays: 0 };
  let totalHours = 0;
  requests.forEach(request => {
    const hours = ageHours(request.createdAt, now);
    totalHours += hours;
    if (hours < 24) buckets.under24Hours += 1;
    else if (hours < 72) buckets.oneToThreeDays += 1;
    else if (hours < 168) buckets.threeToSevenDays += 1;
    else buckets.overSevenDays += 1;
  });
  const oldest = [...requests].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)).slice(0, 5);
  return {
    pending: requests.length,
    overdue: requests.filter(request => request.dueAt && new Date(request.dueAt) < now).length,
    averageAgeHours: requests.length ? Math.round((totalHours / requests.length) * 10) / 10 : 0,
    buckets,
    oldest: oldest.map(request => ({
      id: request.id,
      title: request.title,
      priority: request.priority,
      ageHours: Math.round(ageHours(request.createdAt, now) * 10) / 10,
      dueAt: request.dueAt || null,
      href: `/requests?requestId=${request.id}`
    }))
  };
}

function classificationMetrics(items) {
  const classified = items.filter(item => item.aiSuggestedType);
  const transitions = new Map();
  classified.forEach(item => {
    const key = `${item.aiSuggestedType}->${item.humanConfirmedType}`;
    transitions.set(key, (transitions.get(key) || 0) + 1);
  });
  const corrected = classified.filter(item => item.aiSuggestedType !== item.humanConfirmedType).length;
  return {
    evaluated: classified.length,
    accepted: classified.length - corrected,
    corrected,
    correctionRate: classified.length ? Math.round((corrected / classified.length) * 100) : 0,
    byTransition: [...transitions.entries()].map(([transition, count]) => {
      const [suggestedType, confirmedType] = transition.split('->');
      return { suggestedType, confirmedType, count };
    }).sort((left, right) => right.count - left.count)
  };
}

function periodBefore(start, end) {
  const durationMs = new Date(end).getTime() - new Date(start).getTime();
  return {
    start: new Date(new Date(start).getTime() - durationMs),
    end: new Date(start)
  };
}

function changePercent(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return Math.round(((current - previous) / previous) * 100);
}

function compareCounts(currentMap, previousMap, keyName) {
  const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
  return keys.map(key => {
    const current = currentMap.get(key) || 0;
    const previous = previousMap.get(key) || 0;
    return {
      [keyName]: key,
      current,
      previous,
      delta: current - previous,
      changePercent: changePercent(current, previous)
    };
  }).sort((left, right) => right.current - left.current || right.previous - left.previous || String(left[keyName]).localeCompare(String(right[keyName])));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function areaTrendCounts(items) {
  const counts = new Map();
  items.forEach(item => {
    const areas = item.OperationalAreas || [];
    if (areas.length === 0) {
      increment(counts, 'organisation');
      return;
    }
    areas.forEach(area => increment(counts, `${area.id}:${area.name}`));
  });
  return counts;
}

function normalizeAreaTrendKey(row) {
  if (row.area === 'organisation') return { areaId: null, areaName: 'Organisation', areaKey: 'organisation' };
  const [id, ...nameParts] = String(row.area).split(':');
  return { areaId: Number(id), areaName: nameParts.join(':') || `Area ${id}`, areaKey: row.area };
}

function buildTrendComparison({ current, previous, start, end, previousStart, previousEnd }) {
  const currentByType = new Map();
  const previousByType = new Map();
  Object.entries(current).forEach(([type, items]) => increment(currentByType, type, items.length));
  Object.entries(previous).forEach(([type, items]) => increment(previousByType, type, items.length));

  const currentAreaCounts = new Map();
  const previousAreaCounts = new Map();
  Object.values(current).flat().forEach(item => areaTrendCounts([item]).forEach((count, key) => increment(currentAreaCounts, key, count)));
  Object.values(previous).flat().forEach(item => areaTrendCounts([item]).forEach((count, key) => increment(previousAreaCounts, key, count)));

  return {
    period: { start, end, previousStart, previousEnd },
    byType: compareCounts(currentByType, previousByType, 'type'),
    byArea: compareCounts(currentAreaCounts, previousAreaCounts, 'area')
      .map(row => ({ ...normalizeAreaTrendKey(row), current: row.current, previous: row.previous, delta: row.delta, changePercent: row.changePercent }))
  };
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function suggestedSignalBase({ signalType, severity = 'info', title, summary, evidence, start, end, areaId = null, fingerprintKey }) {
  return {
    signalType,
    severity,
    title,
    summary,
    areaId,
    periodStart: iso(start),
    periodEnd: iso(end),
    fingerprint: `${signalType}:${iso(start)}:${iso(end)}:${fingerprintKey}`,
    dedupeKey: `${signalType}:${areaId || 'org'}:${fingerprintKey}`,
    suggestedAction: summary ? `Review and respond to this operational signal: ${summary}` : `Review and respond to this ${signalType} signal.`,
    evidence
  };
}

function buildSuggestedSignalInputs({ intelligence, start, end, acknowledgements = null, config = null }) {
  const signals = [];
  const thresholds = operationalIntelligenceConfig.normalizeConfig(config || {}).thresholds;
  const requestAgingMetrics = intelligence?.requestAging || {};
  const classification = intelligence?.classification || {};
  const conversions = intelligence?.conversions || {};
  const trends = intelligence?.trends || {};
  const requestBuckets = requestAgingMetrics.buckets || {};

  if (
    (requestAgingMetrics.overdue || 0) >= thresholds.requestAgingOverdueCount
    || (requestBuckets.overSevenDays || 0) >= thresholds.requestAgingOverSevenDaysCount
    || (requestAgingMetrics.averageAgeHours || 0) >= thresholds.requestAgingAverageAgeHours
  ) {
    signals.push(suggestedSignalBase({
      signalType: 'REQUEST_AGING',
      severity: (requestAgingMetrics.overdue || 0) >= thresholds.requestAgingOverdueCount || (requestBuckets.overSevenDays || 0) >= thresholds.requestAgingOverSevenDaysCount ? 'critical' : 'warning',
      title: 'Pending Requests need review',
      summary: `${requestAgingMetrics.pending || 0} pending Requests; ${requestAgingMetrics.overdue || 0} overdue; average age ${requestAgingMetrics.averageAgeHours || 0} hours.`,
      evidence: requestAgingMetrics,
      start,
      end,
      fingerprintKey: 'request-aging-backlog'
    }));
  }

  if ((classification.evaluated || 0) >= thresholds.classificationMinimumEvaluated && (classification.corrected || 0) >= thresholds.classificationMinimumCorrected && (classification.correctionRate || 0) >= thresholds.classificationCorrectionRate) {
    signals.push(suggestedSignalBase({
      signalType: 'CLASSIFICATION_CORRECTION',
      severity: (classification.correctionRate || 0) >= 50 ? 'warning' : 'info',
      title: 'Classification corrections are trending',
      summary: `${classification.corrected} of ${classification.evaluated} confirmed classifications were corrected by humans.`,
      evidence: classification,
      start,
      end,
      fingerprintKey: 'classification-corrections'
    }));
  }

  if ((conversions.total || 0) >= thresholds.conversionMinimumTotal && ((conversions.rejected || 0) > 0 || (conversions.completionRate || 0) < thresholds.conversionCompletionRate)) {
    signals.push(suggestedSignalBase({
      signalType: 'CONVERSION_OUTCOME',
      severity: (conversions.rejected || 0) > 0 ? 'warning' : 'info',
      title: 'Generated Task outcomes need review',
      summary: `${conversions.total} Tasks were generated from Requests/Notes with ${conversions.completionRate || 0}% completion.`,
      evidence: conversions,
      start,
      end,
      fingerprintKey: 'conversion-outcomes'
    }));
  }

  (trends.byType || [])
    .filter(row => row.delta >= thresholds.trendMinimumDelta && row.changePercent >= thresholds.trendMinimumChangePercent)
    .slice(0, 3)
    .forEach(row => signals.push(suggestedSignalBase({
      signalType: 'TREND',
      severity: row.delta >= thresholds.trendWarningDelta ? 'warning' : 'info',
      title: `${row.type} volume increased`,
      summary: `${row.type} volume increased by ${row.delta} versus the previous equivalent period.`,
      evidence: row,
      start,
      end,
      fingerprintKey: `type-${row.type}`
    })));

  (trends.byArea || [])
    .filter(row => row.areaId && row.delta >= thresholds.trendMinimumDelta && row.changePercent >= thresholds.trendMinimumChangePercent)
    .slice(0, 3)
    .forEach(row => signals.push(suggestedSignalBase({
      signalType: 'TREND',
      severity: row.delta >= thresholds.trendWarningDelta ? 'warning' : 'info',
      title: `${row.areaName} activity increased`,
      summary: `${row.areaName} activity increased by ${row.delta} items versus the previous equivalent period.`,
      evidence: row,
      start,
      end,
      areaId: row.areaId,
      fingerprintKey: `area-${row.areaId}`
    })));

  if (acknowledgements && (acknowledgements.outstandingAcknowledgements || 0) >= thresholds.noticeOutstandingCount) {
    signals.push(suggestedSignalBase({
      signalType: 'NOTICE_ACKNOWLEDGEMENT',
      severity: (acknowledgements.overdueNotices || 0) > 0 ? 'warning' : 'info',
      title: 'Notice acknowledgements outstanding',
      summary: `${acknowledgements.outstandingAcknowledgements} required notice acknowledgements remain outstanding.`,
      evidence: acknowledgements,
      start,
      end,
      fingerprintKey: 'notice-acknowledgements'
    }));
  }

  return signals;
}

function areaIds(item) {
  return (item.OperationalAreas || []).map(area => Number(area.id));
}

function recurrenceItems({ tasks, notices, requests, records }) {
  return [
    ...tasks.filter(task => !parseJson(task.payload).operationalSource).map(task => {
      const payload = parseJson(task.payload);
      return { key: `TASK:${task.id}`, type: 'TASK', id: task.id, title: payload.summary || task.subType || task.category || 'Task', text: payload.originalText || task.suggestedAction, eventAt: task.createdAt, areaIds: areaIds(task), href: `/tasks?taskId=${task.id}` };
    }),
    ...notices.map(item => ({ key: `NOTICE:${item.id}`, type: 'NOTICE', id: item.id, title: item.title, text: item.body, eventAt: item.createdAt, areaIds: areaIds(item), href: `/noticeboard?noticeId=${item.id}` })),
    ...requests.map(item => ({ key: `REQUEST:${item.id}`, type: 'REQUEST', id: item.id, title: item.title, text: item.originalText || item.body, eventAt: item.createdAt, areaIds: areaIds(item), href: `/requests?requestId=${item.id}` })),
    ...records.map(item => ({ key: `NOTE:${item.id}`, type: 'NOTE', id: item.id, title: item.title, text: item.originalText || item.body, eventAt: item.occurredAt || item.createdAt, areaIds: areaIds(item), href: `/notes?recordId=${item.id}` }))
  ];
}

async function conversionMetrics({ wineryId, start, end }) {
  const relations = await OperationalItemRelation.findAll({
    where: { wineryId, relationType: 'GENERATED_TASK', createdAt: { [Op.gte]: start, [Op.lt]: end } },
    raw: true
  });
  const taskIds = relations.map(relation => relation.targetId);
  const tasks = taskIds.length ? await Task.findAll({ where: { wineryId, id: { [Op.in]: taskIds } }, raw: true }) : [];
  const byTaskId = new Map(tasks.map(task => [Number(task.id), task]));
  const bySourceType = new Map();
  const byTaskStatus = new Map();
  relations.forEach(relation => {
    bySourceType.set(relation.sourceType, (bySourceType.get(relation.sourceType) || 0) + 1);
    const status = byTaskId.get(Number(relation.targetId))?.status || 'MISSING';
    byTaskStatus.set(status, (byTaskStatus.get(status) || 0) + 1);
  });
  const completed = relations.filter(relation => byTaskId.get(Number(relation.targetId))?.status === 'ACTIONED').length;
  return {
    total: relations.length,
    completed,
    pending: relations.filter(relation => byTaskId.get(Number(relation.targetId))?.status === 'PENDING').length,
    rejected: relations.filter(relation => byTaskId.get(Number(relation.targetId))?.status === 'REJECTED').length,
    completionRate: relations.length ? Math.round((completed / relations.length) * 100) : 0,
    bySourceType: [...bySourceType.entries()].map(([sourceType, count]) => ({ sourceType, count })),
    byTaskStatus: [...byTaskStatus.entries()].map(([status, count]) => ({ status, count }))
  };
}

async function trendMetrics({ wineryId, start, end }) {
  const previousPeriod = periodBefore(start, end);
  const areaInclude = () => ({
    model: OperationalArea,
    as: 'OperationalAreas',
    where: { wineryId },
    attributes: ['id', 'name'],
    through: { attributes: [], where: { wineryId } },
    required: false
  });
  const currentFilter = { [Op.gte]: start, [Op.lt]: end };
  const previousFilter = { [Op.gte]: previousPeriod.start, [Op.lt]: previousPeriod.end };
  const commonAttributes = ['id', 'createdAt'];

  const [
    currentTasks,
    currentNotices,
    currentRequests,
    currentRecords,
    previousTasks,
    previousNotices,
    previousRequests,
    previousRecords
  ] = await Promise.all([
    Task.findAll({ where: { wineryId, createdAt: currentFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    Notice.findAll({ where: { wineryId, createdAt: currentFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    OperationalRequest.findAll({ where: { wineryId, createdAt: currentFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    OperationalRecord.findAll({ where: { wineryId, createdAt: currentFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    Task.findAll({ where: { wineryId, createdAt: previousFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    Notice.findAll({ where: { wineryId, createdAt: previousFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    OperationalRequest.findAll({ where: { wineryId, createdAt: previousFilter }, attributes: commonAttributes, include: [areaInclude()] }),
    OperationalRecord.findAll({ where: { wineryId, createdAt: previousFilter }, attributes: commonAttributes, include: [areaInclude()] })
  ]);

  return buildTrendComparison({
    current: { TASK: currentTasks, NOTICE: currentNotices, REQUEST: currentRequests, NOTE: currentRecords },
    previous: { TASK: previousTasks, NOTICE: previousNotices, REQUEST: previousRequests, NOTE: previousRecords },
    start,
    end,
    previousStart: previousPeriod.start,
    previousEnd: previousPeriod.end
  });
}

async function getOperationalIntelligence({ wineryId, start, end, now = new Date() }) {
  const periodFilter = { [Op.gte]: start, [Op.lt]: end };
  const recurrenceLimit = 250;
  const areaInclude = () => ({
    model: OperationalArea,
    as: 'OperationalAreas',
    where: { wineryId },
    attributes: ['id', 'name'],
    through: { attributes: [], where: { wineryId } },
    required: false
  });
  const [pendingRequests, requests, records, classificationRequests, classificationRecords, tasks, notices, conversions, trends] = await Promise.all([
    OperationalRequest.findAll({ where: { wineryId, status: 'PENDING' }, attributes: ['id', 'title', 'priority', 'dueAt', 'createdAt'], raw: true }),
    OperationalRequest.findAll({ where: { wineryId, createdAt: periodFilter }, include: [areaInclude()], order: [['createdAt', 'DESC']], limit: recurrenceLimit }),
    OperationalRecord.findAll({ where: { wineryId, createdAt: periodFilter }, include: [areaInclude()], order: [['createdAt', 'DESC']], limit: recurrenceLimit }),
    OperationalRequest.findAll({ where: { wineryId, createdAt: periodFilter, aiSuggestedType: { [Op.ne]: null } }, attributes: ['aiSuggestedType', 'humanConfirmedType'], raw: true }),
    OperationalRecord.findAll({ where: { wineryId, createdAt: periodFilter, aiSuggestedType: { [Op.ne]: null } }, attributes: ['aiSuggestedType', 'humanConfirmedType'], raw: true }),
    Task.findAll({ where: { wineryId, createdAt: periodFilter }, attributes: ['id', 'category', 'subType', 'payload', 'suggestedAction', 'createdAt'], include: [areaInclude()], order: [['createdAt', 'DESC']], limit: recurrenceLimit }),
    Notice.findAll({ where: { wineryId, createdAt: periodFilter }, attributes: ['id', 'title', 'body', 'createdAt'], include: [areaInclude()], order: [['createdAt', 'DESC']], limit: recurrenceLimit }),
    conversionMetrics({ wineryId, start, end }),
    trendMetrics({ wineryId, start, end })
  ]);
  const recurrenceInput = recurrenceItems({ tasks, notices, requests, records });
  return {
    requestAging: requestAging(pendingRequests, now),
    classification: classificationMetrics([...classificationRequests, ...classificationRecords]),
    conversions,
    recurrence: {
      advisory: true,
      method: 'significant-term-overlap-v1',
      inputCount: recurrenceInput.length,
      maximumItemsPerType: recurrenceLimit,
      clusters: detectRecurrenceClusters(recurrenceInput)
    },
    trends
  };
}

async function getNoticeAcknowledgementMetrics({ wineryId, userId, start, end }) {
  const periodFilter = { [Op.gte]: start, [Op.lt]: end };
  const requiredNotices = await Notice.findAll({
    where: { wineryId, requiresAcknowledgement: true, createdAt: periodFilter },
    include: [{
      model: OperationalArea,
      as: 'OperationalAreas',
      where: { wineryId },
      attributes: ['id', 'name'],
      through: { attributes: [], where: { wineryId } },
      required: false
    }]
  });
  await noticeService.attachAcknowledgementState(requiredNotices, { wineryId, userId });
  const acknowledgementStates = requiredNotices.map(notice => notice.getDataValue('acknowledgement') || {});
  const expectedAcknowledgements = acknowledgementStates.reduce((sum, state) => sum + (state.expectedCount || 0), 0);
  const completedAcknowledgements = acknowledgementStates.reduce((sum, state) => sum + (state.acknowledgedCount || 0), 0);
  return {
    requiredNotices: requiredNotices.length,
    fullyAcknowledgedNotices: acknowledgementStates.filter(state => state.outstandingCount === 0).length,
    overdueNotices: acknowledgementStates.filter(state => state.isOverdue).length,
    expectedAcknowledgements,
    completedAcknowledgements,
    outstandingAcknowledgements: Math.max(expectedAcknowledgements - completedAcknowledgements, 0),
    completionRate: expectedAcknowledgements ? Math.round((completedAcknowledgements / expectedAcknowledgements) * 100) : 0,
    acknowledgementsThisPeriod: await NoticeAcknowledgement.count({ where: { wineryId, acknowledgedAt: periodFilter } })
  };
}

function signalKey(signal) {
  return signal.fingerprint || `${signal.signalType}:${signal.areaId || 'org'}:${signal.title}`;
}

function signalSummary(signal) {
  return {
    fingerprint: signal.fingerprint,
    signalType: signal.signalType,
    severity: signal.severity,
    title: signal.title,
    summary: signal.summary,
    areaId: signal.areaId || null
  };
}

function countBySignalType(signals) {
  return signals.reduce((counts, signal) => ({
    ...counts,
    [signal.signalType]: (counts[signal.signalType] || 0) + 1
  }), {});
}

function compareSuggestedSignals(currentSignals, previewSignals) {
  const currentByKey = new Map(currentSignals.map(signal => [signalKey(signal), signal]));
  const previewByKey = new Map(previewSignals.map(signal => [signalKey(signal), signal]));
  const addedSignals = previewSignals
    .filter(signal => !currentByKey.has(signalKey(signal)))
    .map(signalSummary);
  const removedSignals = currentSignals
    .filter(signal => !previewByKey.has(signalKey(signal)))
    .map(signalSummary);
  const changedSignals = previewSignals
    .filter(signal => {
      const current = currentByKey.get(signalKey(signal));
      return current && current.severity !== signal.severity;
    })
    .map(signal => ({
      ...signalSummary(signal),
      previousSeverity: currentByKey.get(signalKey(signal)).severity
    }));

  return {
    currentSuggestedCount: currentSignals.length,
    previewSuggestedCount: previewSignals.length,
    deltaSuggestedCount: previewSignals.length - currentSignals.length,
    currentByType: countBySignalType(currentSignals),
    previewByType: countBySignalType(previewSignals),
    addedSignals,
    removedSignals,
    changedSignals,
    unchangedCount: previewSignals.filter(signal => {
      const current = currentByKey.get(signalKey(signal));
      return current && current.severity === signal.severity;
    }).length
  };
}

function sumSignalTypeCounts(rows, field) {
  return rows.reduce((totals, row) => {
    Object.entries(row.impact[field] || {}).forEach(([type, count]) => {
      totals[type] = (totals[type] || 0) + count;
    });
    return totals;
  }, {});
}

function aggregatePreviewHistory(rows) {
  return {
    periodCount: rows.length,
    totals: {
      currentSuggestedCount: rows.reduce((sum, row) => sum + row.impact.currentSuggestedCount, 0),
      previewSuggestedCount: rows.reduce((sum, row) => sum + row.impact.previewSuggestedCount, 0),
      deltaSuggestedCount: rows.reduce((sum, row) => sum + row.impact.deltaSuggestedCount, 0),
      addedSignalCount: rows.reduce((sum, row) => sum + row.impact.addedSignals.length, 0),
      removedSignalCount: rows.reduce((sum, row) => sum + row.impact.removedSignals.length, 0),
      changedSignalCount: rows.reduce((sum, row) => sum + row.impact.changedSignals.length, 0)
    },
    currentByType: sumSignalTypeCounts(rows, 'currentByType'),
    previewByType: sumSignalTypeCounts(rows, 'previewByType'),
    windows: rows
  };
}

async function previewConfigImpactForRange({ wineryId, userId, start, end, currentConfig, previewConfig, now }) {
  const [intelligence, acknowledgements] = await Promise.all([
    getOperationalIntelligence({ wineryId, start, end, now }),
    getNoticeAcknowledgementMetrics({ wineryId, userId, start, end })
  ]);
  const currentSignals = buildSuggestedSignalInputs({
    intelligence,
    acknowledgements,
    start,
    end,
    config: currentConfig
  });
  const previewSignals = buildSuggestedSignalInputs({
    intelligence,
    acknowledgements,
    start,
    end,
    config: previewConfig
  });

  return {
    period: {
      start: iso(start),
      end: iso(end)
    },
    impact: compareSuggestedSignals(currentSignals, previewSignals)
  };
}

async function previewConfigImpact({ wineryId, userId, start, end, ranges = null, patch, now = new Date() }) {
  const currentConfig = await operationalIntelligenceConfig.getConfigForWinery(wineryId);
  const previewConfig = operationalIntelligenceConfig.mergeConfig(currentConfig, patch || {});
  const previewRanges = ranges?.length ? ranges : [{ start, end }];
  const windows = [];
  for (const range of previewRanges.slice(0, 6)) {
    windows.push(await previewConfigImpactForRange({
      wineryId,
      userId,
      start: range.start,
      end: range.end,
      currentConfig,
      previewConfig,
      now
    }));
  }
  const selected = windows[0] || await previewConfigImpactForRange({
    wineryId,
    userId,
    start,
    end,
    currentConfig,
    previewConfig,
    now
  });

  return {
    ...selected,
    currentConfig,
    previewConfig,
    changedKeys: operationalIntelligenceConfig.changedKeys(currentConfig, previewConfig),
    changedFields: operationalIntelligenceConfig.changedFields(currentConfig, previewConfig),
    history: aggregatePreviewHistory(windows.length ? windows : [selected])
  };
}

module.exports = {
  significantTerms,
  detectRecurrenceClusters,
  requestAging,
  classificationMetrics,
  buildTrendComparison,
  buildSuggestedSignalInputs,
  getOperationalIntelligence,
  getNoticeAcknowledgementMetrics,
  previewConfigImpact
};
