function normalizeTaskPagination(pagination = {}) {
  const page = Math.max(parseInt(pagination.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(pagination.pageSize) || 20, 1), 100);
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function emptyTaskPage(limit) {
  return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 } };
}

function intersectTaskIds(currentIds, candidateIds) {
  const normalizedCandidates = [...new Set(candidateIds.map(Number).filter(Number.isFinite))];
  if (currentIds === null) return normalizedCandidates;
  const candidates = new Set(normalizedCandidates);
  return currentIds.filter(id => candidates.has(Number(id)));
}

function applyStandardTaskFilters({ whereClause, filters, userId, Op, now = new Date(), dueSoonHours = 24 }) {
  const {
    status, type, priority, assignedToMe, category, sentiment, assigneeId,
    createdById, dateFrom, dateTo, deadlineState
  } = filters;

  if (status && status !== 'all') whereClause.status = status;
  if (type && type !== 'all') whereClause.type = type;
  if (priority && priority !== 'all') whereClause.priority = priority;
  if (category && category !== 'all') whereClause.category = category;
  if (sentiment && sentiment !== 'all') whereClause.sentiment = sentiment;

  if (deadlineState && deadlineState !== 'all') {
    const state = String(deadlineState).toUpperCase();
    const dueSoonCutoff = new Date(now.getTime() + dueSoonHours * 60 * 60 * 1000);
    if (state === 'OVERDUE') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = { [Op.lt]: now };
    } else if (state === 'DUE_SOON') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = { [Op.gte]: now, [Op.lte]: dueSoonCutoff };
    } else if (state === 'SCHEDULED') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = { [Op.gt]: dueSoonCutoff };
    }
  }

  if (dateFrom || dateTo) {
    whereClause.createdAt = {};
    if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      whereClause.createdAt[Op.lte] = end;
    }
  }

  if (assigneeId && assigneeId !== 'all') {
    if (assigneeId === 'unassigned') whereClause.assigneeId = null;
    else if (assigneeId === 'me') whereClause.assigneeId = userId;
    else whereClause.assigneeId = Number(assigneeId);
  }
  if (createdById && createdById !== 'all') {
    whereClause.createdBy = createdById === 'system' ? null : Number(createdById);
  }
  if (assignedToMe === 'true') whereClause.assigneeId = userId;
  return whereClause;
}

function buildTaskOrder({ sortBy, search, Sequelize, sequelize, deadlineService }) {
  const oldest = sortBy === 'feed_oldest' || sortBy === 'oldest';
  const feedSort = sortBy === 'feed_newest' || sortBy === 'feed_oldest';
  const order = feedSort
    ? [['createdAt', oldest ? 'ASC' : 'DESC'], ['id', oldest ? 'ASC' : 'DESC']]
    : [
      [Sequelize.literal(deadlineService.getDeadlineOrderExpression(sequelize)), 'ASC'],
      [Sequelize.literal(deadlineService.getOpenTaskDueAtOrderExpression(sequelize)), 'ASC'],
      ['createdAt', oldest ? 'ASC' : 'DESC']
    ];

  if (search && /^\d+$/.test(search.trim())) {
    order.unshift([Sequelize.literal(`\`Task\`.\`id\` = ${parseInt(search.trim())}`), 'DESC']);
  }
  return order;
}

module.exports = {
  applyStandardTaskFilters,
  buildTaskOrder,
  emptyTaskPage,
  intersectTaskIds,
  normalizeTaskPagination
};
