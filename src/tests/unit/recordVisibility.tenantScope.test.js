jest.mock('../../models', () => ({
  NoticeArea: { findAll: jest.fn() },
  Notification: { findAll: jest.fn() },
  Project: {},
  ProjectItem: { findAll: jest.fn() },
  Task: { findAll: jest.fn() },
  TaskArea: { findAll: jest.fn() }
}));

jest.mock('../../services/operationalArea.service', () => ({
  isGlobalManager: jest.fn(() => false),
  getUserAreaAccess: jest.fn()
}));

const {
  NoticeArea,
  Notification,
  ProjectItem,
  Task,
  TaskArea
} = require('../../models');
const operationalAreaService = require('../../services/operationalArea.service');
const recordVisibility = require('../../services/recordVisibility.service');

describe('record visibility tenant scoping', () => {
  const context = {
    wineryId: 1,
    userId: 7,
    userRole: 'staff'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Notification.findAll.mockResolvedValue([]);
    ProjectItem.findAll.mockResolvedValue([]);
    Task.findAll.mockResolvedValue([]);
    TaskArea.findAll.mockResolvedValue([]);
    NoticeArea.findAll.mockResolvedValue([]);
    operationalAreaService.getUserAreaAccess.mockResolvedValue({
      areaIds: [11],
      managedAreaIds: []
    });
  });

  test('ignores task-area rows whose recorded winery differs from the task tenant', async () => {
    const visible = await recordVisibility.canViewTask({
      id: 22,
      wineryId: 1,
      areaScope: 'AREAS',
      assigneeId: null,
      createdBy: 8
    }, context);

    expect(visible).toBe(false);
    expect(TaskArea.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 22, wineryId: 1 }
    }));
  });

  test('ignores notice-area rows whose recorded winery differs from the notice tenant', async () => {
    const visible = await recordVisibility.canViewNotice({
      id: 33,
      wineryId: 1,
      areaScope: 'AREAS',
      audienceType: 'all_staff'
    }, context);

    expect(visible).toBe(false);
    expect(NoticeArea.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { noticeId: 33, wineryId: 1 }
    }));
  });

  test('validates mentioned task IDs against the current winery', async () => {
    Notification.findAll.mockResolvedValue([{ data: { taskId: 99 } }]);

    await recordVisibility.canViewTask({
      id: 22,
      wineryId: 1,
      areaScope: 'AREAS',
      assigneeId: null,
      createdBy: 8
    }, context);

    expect(Task.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ wineryId: 1 })
    }));
  });
});
