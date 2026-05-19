jest.mock('../../models', () => ({
  Task: {
    findAll: jest.fn(),
    sequelize: {
      getDialect: jest.fn(() => 'sqlite')
    }
  },
  Notification: {
    findAll: jest.fn(),
    create: jest.fn()
  },
  User: {
    findOne: jest.fn()
  }
}));

jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const { Task, Notification, User } = require('../../models');
const taskDeadlineService = require('../../services/taskDeadline.service');

describe('taskDeadline.service', () => {
  const now = new Date('2026-04-30T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TASK_DEADLINE_DUE_SOON_HOURS;
    delete process.env.TASK_DEADLINE_MANAGER_ESCALATION_HOURS;
    delete process.env.TASK_DEADLINE_OVERDUE_REPEAT_HOURS;
    Notification.findAll.mockResolvedValue([]);
    Notification.create.mockImplementation(async notification => ({ id: 100, ...notification }));
    User.findOne.mockResolvedValue({ id: 99 });
  });

  it('computes deadline state without changing task priority', () => {
    const task = {
      id: 1,
      status: 'PENDING',
      priority: 'low',
      dueAt: '2026-04-30T10:00:00.000Z'
    };

    const state = taskDeadlineService.getDeadlineState(task, now);

    expect(state.deadlineState).toBe('OVERDUE');
    expect(state.isOverdue).toBe(true);
    expect(state.effectiveUrgency).toBe('overdue');
    expect(task.priority).toBe('low');
  });

  it('marks open tasks due within the threshold as due soon', () => {
    const state = taskDeadlineService.getDeadlineState({
      id: 2,
      status: 'PENDING',
      dueAt: '2026-05-01T11:00:00.000Z'
    }, now, { dueSoonHours: 24 });

    expect(state.deadlineState).toBe('DUE_SOON');
    expect(state.isDueSoon).toBe(true);
    expect(state.hoursUntilDue).toBe(23);
  });

  it('ignores closed tasks even when they have a past due date', () => {
    const state = taskDeadlineService.getDeadlineState({
      id: 3,
      status: 'ACTIONED',
      dueAt: '2026-04-29T11:00:00.000Z'
    }, now);

    expect(state.deadlineState).toBe('NONE');
    expect(state.isOverdue).toBe(false);
  });

  it('creates one due-soon reminder for the assigned user', async () => {
    Task.findAll.mockResolvedValue([{
      id: 4,
      wineryId: 1,
      status: 'PENDING',
      assigneeId: 7,
      priority: 'normal',
      dueAt: '2026-05-01T11:00:00.000Z'
    }]);

    const result = await taskDeadlineService.sendTaskDeadlineReminders({
      now,
      dueSoonHours: 24
    });

    expect(result.created).toBe(1);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      type: 'SYSTEM',
      message: 'Task #4 is approaching its deadline.',
      data: expect.objectContaining({
        taskId: 4,
        reminderKind: 'DUE_SOON',
        deadlineState: 'DUE_SOON'
      })
    }), expect.any(Object));
  });

  it('does not duplicate reminders with the same reminder key', async () => {
    const task = {
      id: 5,
      wineryId: 1,
      status: 'PENDING',
      assigneeId: 7,
      dueAt: '2026-05-01T11:00:00.000Z'
    };
    const reminderKey = taskDeadlineService.buildReminderKey(task, 'DUE_SOON', now);

    Task.findAll.mockResolvedValue([task]);
    Notification.findAll.mockResolvedValue([{ data: { reminderKey } }]);

    const result = await taskDeadlineService.sendTaskDeadlineReminders({
      now,
      dueSoonHours: 24
    });

    expect(result.created).toBe(0);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it('creates overdue reminders and escalates stale overdue tasks to the manager', async () => {
    Task.findAll.mockResolvedValue([{
      id: 6,
      wineryId: 1,
      status: 'PENDING',
      assigneeId: 7,
      dueAt: '2026-04-29T08:00:00.000Z'
    }]);

    const result = await taskDeadlineService.sendTaskDeadlineReminders({
      now,
      dueSoonHours: 24
    });

    expect(result.created).toBe(2);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      message: 'Task #6 has passed its deadline.',
      data: expect.objectContaining({
        reminderKind: 'OVERDUE',
        deadlineState: 'OVERDUE'
      })
    }), expect.any(Object));
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 99,
      message: expect.stringContaining('needs manager review'),
      data: expect.objectContaining({
        reminderKind: 'MANAGER_ESCALATION',
        assigneeId: 7
      })
    }), expect.any(Object));
  });
});
