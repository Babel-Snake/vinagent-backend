jest.mock('../../models', () => ({
  Attachment: { findAll: jest.fn() },
  Member: { findAll: jest.fn() },
  Message: { findAll: jest.fn() },
  OperationalArea: {},
  Task: {
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    sequelize: {}
  },
  TaskAction: { findAll: jest.fn() },
  TaskArea: { findAll: jest.fn() },
  TaskStep: { findAll: jest.fn() },
  User: { findByPk: jest.fn() },
  UserTaskFlag: { findAll: jest.fn() }
}));

jest.mock('../../services/notice.service', () => ({
  getLinkedNoticeInclude: jest.fn(() => ({ association: 'LinkedNotices' }))
}));

jest.mock('../../services/recordVisibility.service', () => ({
  assertCanViewTask: jest.fn(),
  buildTaskVisibilityPredicate: jest.fn(),
  canViewNotice: jest.fn()
}));

jest.mock('../../services/taskDeadline.service', () => ({
  attachDeadlineState: jest.fn(task => ({ task, deadlineState: 'TEST' })),
  getDeadlineConfig: jest.fn(() => ({ dueSoonHours: 48 })),
  getDeadlineOrderExpression: jest.fn(() => 'deadline-order'),
  getOpenTaskDueAtOrderExpression: jest.fn(() => 'due-date-order')
}));

const { Task, UserTaskFlag } = require('../../models');
const recordVisibility = require('../../services/recordVisibility.service');
const taskDeadlineService = require('../../services/taskDeadline.service');
const { getTaskById } = require('../../services/taskDetailQuery.service');
const { getTasksForWinery } = require('../../services/taskListQuery.service');

describe('task read query services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty page without querying tasks when no flags exist', async () => {
    UserTaskFlag.findAll.mockResolvedValue([]);

    const result = await getTasksForWinery({
      wineryId: 1,
      userId: 7,
      userRole: 'manager',
      filters: { showOnlyFlagged: true },
      pagination: { pageSize: 25 }
    });

    expect(result).toEqual({
      tasks: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 }
    });
    expect(Task.findAndCountAll).not.toHaveBeenCalled();
  });

  it('returns a typed not-found error for a missing task detail', async () => {
    Task.findOne.mockResolvedValue(null);

    await expect(getTaskById({ taskId: 404, wineryId: 1 })).rejects.toMatchObject({
      message: 'Task not found',
      statusCode: 404,
      code: 'NOT_FOUND'
    });
  });

  it('filters linked notices through visibility before attaching deadline state', async () => {
    const visibleNotice = { id: 1 };
    const hiddenNotice = { id: 2 };
    const task = {
      id: 42,
      LinkedNotices: [visibleNotice, hiddenNotice],
      setDataValue: jest.fn()
    };
    Task.findOne.mockResolvedValue(task);
    recordVisibility.canViewNotice.mockImplementation(async notice => notice.id === visibleNotice.id);

    const result = await getTaskById({
      taskId: 42,
      wineryId: 1,
      userId: 7,
      userRole: 'staff'
    });

    expect(recordVisibility.assertCanViewTask).toHaveBeenCalledWith(task, {
      wineryId: 1,
      userId: 7,
      userRole: 'staff'
    });
    expect(task.setDataValue).toHaveBeenCalledWith('LinkedNotices', [visibleNotice]);
    expect(taskDeadlineService.attachDeadlineState).toHaveBeenCalledWith(task);
    expect(result).toEqual({ task, deadlineState: 'TEST' });
  });
});
