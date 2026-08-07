const taskService = require('./taskService');
const noticeService = require('./notice.service');
const operationalItemService = require('./operationalItem.service');
const operationalAreaService = require('./operationalArea.service');
const involvementService = require('./involvement.service');

const TYPES = ['TASK', 'NOTICE', 'REQUEST', 'NOTE'];
const STATUS_BY_TYPE = {
  TASK: new Set(['PENDING', 'ACTIONED', 'REJECTED']),
  NOTICE: new Set(['ACTIVE', 'EXPIRED', 'ARCHIVED']),
  REQUEST: new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
  NOTE: new Set(['RECORDED'])
};

function parseTypes(value) {
  const requested = String(value || '')
    .split(',')
    .map(type => type.trim().toUpperCase())
    .filter(type => TYPES.includes(type));
  return requested.length > 0 ? [...new Set(requested)] : TYPES;
}

function isStatusCompatible(type, status) {
  return status === 'ALL' || STATUS_BY_TYPE[type].has(status);
}

function compactText(value, limit = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function areasFor(item) {
  return (item.OperationalAreas || []).map(area => ({ id: area.id, name: area.name }));
}

function taskTitle(task) {
  return task.payload?.summary || task.nextStepSummary || String(task.subType || task.category || 'Task').replace(/_/g, ' ');
}

function serializeTask(task, context) {
  return {
    key: `TASK:${task.id}`,
    type: 'TASK',
    id: task.id,
    title: taskTitle(task),
    bodyPreview: compactText(task.payload?.originalText || task.suggestedAction || task.resolutionSummary),
    status: task.status,
    priority: task.priority,
    areaScope: task.areaScope,
    areas: areasFor(task),
    createdAt: task.createdAt,
    eventAt: task.createdAt,
    dueAt: task.dueAt || null,
    owner: task.Assignee || null,
    author: task.Creator || null,
    involvement: involvementService.classifyItem('TASK', task, context),
    href: `/tasks?taskId=${task.id}`
  };
}

function serializeNotice(notice, context) {
  return {
    key: `NOTICE:${notice.id}`,
    type: 'NOTICE',
    id: notice.id,
    title: notice.title,
    bodyPreview: notice.bodyPreview || compactText(notice.body),
    status: String(notice.status || 'active').toUpperCase(),
    priority: notice.priority,
    areaScope: notice.areaScope,
    areas: areasFor(notice),
    createdAt: notice.createdAt,
    eventAt: notice.createdAt,
    dueAt: notice.expiresAt || null,
    owner: null,
    author: notice.Author || null,
    involvement: involvementService.classifyItem('NOTICE', notice, context),
    href: `/noticeboard?noticeId=${notice.id}`
  };
}

function serializeRequest(item, context) {
  return {
    key: `REQUEST:${item.id}`,
    type: 'REQUEST',
    id: item.id,
    title: item.title,
    bodyPreview: compactText(item.body),
    status: item.status,
    priority: item.priority,
    areaScope: item.areaScope,
    areas: areasFor(item),
    createdAt: item.createdAt,
    eventAt: item.createdAt,
    dueAt: item.dueAt || null,
    owner: item.RequestedFrom || null,
    author: item.Creator || null,
    involvement: involvementService.classifyItem('REQUEST', item, context),
    href: `/requests?requestId=${item.id}`
  };
}

function serializeRecord(item, context) {
  return {
    key: `NOTE:${item.id}`,
    type: 'NOTE',
    id: item.id,
    title: item.title,
    bodyPreview: compactText(item.body),
    status: 'RECORDED',
    priority: null,
    areaScope: item.areaScope,
    areas: areasFor(item),
    createdAt: item.createdAt,
    eventAt: item.occurredAt || item.createdAt,
    dueAt: null,
    owner: null,
    author: item.Creator || null,
    involvement: involvementService.classifyItem('NOTE', item, context),
    href: `/notes?recordId=${item.id}`
  };
}

async function collectPaged(fetchPage, targetCount) {
  const rows = [];
  let total = 0;
  let page = 1;
  const chunkSize = Math.min(100, targetCount);
  while (rows.length < targetCount) {
    const result = await fetchPage(page, chunkSize);
    total = result.pagination.total;
    rows.push(...result.rows);
    if (rows.length >= total || result.rows.length === 0) break;
    page += 1;
  }
  return { rows, total };
}

async function fetchTasks(context, query, targetCount) {
  if (!isStatusCompatible('TASK', query.status)) return { rows: [], total: 0 };
  return collectPaged(async (page, pageSize) => {
    const result = await taskService.getTasksForWinery({
      ...context,
      filters: {
        status: query.status === 'ALL' ? 'all' : query.status,
        areaId: query.areaId,
        search: query.search,
        sortBy: `feed_${query.sortBy}`
      },
      pagination: { page, pageSize }
    });
    return { rows: result.tasks.map(item => serializeTask(item, context)), pagination: result.pagination };
  }, targetCount);
}

async function fetchNotices(context, query, targetCount) {
  if (!isStatusCompatible('NOTICE', query.status)) return { rows: [], total: 0 };
  return collectPaged(async (page, pageSize) => {
    const result = await noticeService.listNotices({
      ...context,
      filters: {
        status: query.status === 'ALL' ? 'all' : query.status.toLowerCase(),
        areaId: query.areaId,
        search: query.search,
        sortBy: query.sortBy
      },
      pagination: { page, pageSize }
    });
    return { rows: result.notices.map(item => serializeNotice(item, context)), pagination: result.pagination };
  }, targetCount);
}

async function fetchRequests(context, query, targetCount) {
  if (!isStatusCompatible('REQUEST', query.status)) return { rows: [], total: 0 };
  const result = await operationalItemService.listRequests({
    ...context,
    filters: {
      page: 1,
      pageSize: targetCount,
      status: query.status === 'ALL' ? 'all' : query.status,
      areaId: query.areaId,
      search: query.search,
      sortBy: query.sortBy
    }
  });
  return { rows: result.requests.map(item => serializeRequest(item, context)), total: result.pagination.total };
}

async function fetchRecords(context, query, targetCount) {
  if (!isStatusCompatible('NOTE', query.status)) return { rows: [], total: 0 };
  const result = await operationalItemService.listRecords({
    ...context,
    filters: { page: 1, pageSize: targetCount, areaId: query.areaId, search: query.search, sortBy: query.sortBy }
  });
  return { rows: result.records.map(item => serializeRecord(item, context)), total: result.pagination.total };
}

async function listOperations({ wineryId, userId, userRole, query }) {
  const types = parseTypes(query.types);
  const targetCount = query.page * query.pageSize;
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId });
  const context = { wineryId, userId, userRole, areaIds };
  const fetchers = { TASK: fetchTasks, NOTICE: fetchNotices, REQUEST: fetchRequests, NOTE: fetchRecords };
  const results = await Promise.all(types.map(type => fetchers[type](context, query, targetCount)));
  const counts = { TASK: 0, NOTICE: 0, REQUEST: 0, NOTE: 0 };
  const combined = [];
  types.forEach((type, index) => {
    counts[type] = results[index].total;
    combined.push(...results[index].rows);
  });
  combined.sort((left, right) => {
    const difference = new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime();
    if (difference !== 0) return query.sortBy === 'oldest' ? -difference : difference;
    return left.key.localeCompare(right.key);
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const offset = (query.page - 1) * query.pageSize;
  return {
    operations: combined.slice(offset, offset + query.pageSize),
    counts,
    filters: { types, search: query.search, areaId: query.areaId, status: query.status, sortBy: query.sortBy },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    }
  };
}

module.exports = { listOperations, parseTypes };
