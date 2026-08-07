const {
  applyStandardTaskFilters,
  buildTaskOrder,
  emptyTaskPage,
  intersectTaskIds,
  normalizeTaskPagination
} = require('../../services/taskQueryPolicy.service');

describe('taskQueryPolicy service', () => {
  const Op = { lt: Symbol('lt'), lte: Symbol('lte'), gte: Symbol('gte'), gt: Symbol('gt') };

  test('bounds pagination and calculates offsets', () => {
    expect(normalizeTaskPagination({ page: '-2', pageSize: '500' })).toEqual({ page: 1, pageSize: 100, limit: 100, offset: 0 });
    expect(normalizeTaskPagination({ page: '3', pageSize: '25' })).toEqual({ page: 3, pageSize: 25, limit: 25, offset: 50 });
    expect(emptyTaskPage(25).pagination).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  });

  test('intersects normalized task IDs without duplicates', () => {
    expect(intersectTaskIds(null, [1, '2', 2])).toEqual([1, 2]);
    expect(intersectTaskIds([1, 2, 3], ['2', 4])).toEqual([2]);
  });

  test('applies staff, date, and deadline filters consistently', () => {
    const whereClause = { wineryId: 8 };
    const now = new Date('2026-07-11T00:00:00.000Z');
    applyStandardTaskFilters({
      whereClause,
      filters: {
        priority: 'high',
        assignedToMe: 'true',
        createdById: 'system',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        deadlineState: 'DUE_SOON'
      },
      userId: 17,
      Op,
      now,
      dueSoonHours: 12
    });

    expect(whereClause).toMatchObject({
      wineryId: 8,
      priority: 'high',
      assigneeId: 17,
      createdBy: null,
      status: 'PENDING'
    });
    expect(whereClause.dueAt[Op.gte]).toEqual(now);
    expect(whereClause.dueAt[Op.lte]).toEqual(new Date('2026-07-11T12:00:00.000Z'));
    expect(whereClause.createdAt[Op.gte]).toEqual(new Date('2026-07-01'));
    expect(whereClause.createdAt[Op.lte].getHours()).toBe(23);
  });

  test('builds deadline-aware and feed ordering with exact-ID priority', () => {
    const Sequelize = { literal: value => ({ literal: value }) };
    const deadlineService = {
      getDeadlineOrderExpression: () => 'deadline-rank',
      getOpenTaskDueAtOrderExpression: () => 'due-rank'
    };
    const deadlineOrder = buildTaskOrder({ sortBy: 'newest', search: '42', Sequelize, sequelize: {}, deadlineService });
    expect(deadlineOrder[0]).toEqual([{ literal: '`Task`.`id` = 42' }, 'DESC']);
    expect(deadlineOrder[1]).toEqual([{ literal: 'deadline-rank' }, 'ASC']);

    const feedOrder = buildTaskOrder({ sortBy: 'feed_oldest', search: '', Sequelize, sequelize: {}, deadlineService });
    expect(feedOrder).toEqual([['createdAt', 'ASC'], ['id', 'ASC']]);
  });
});
