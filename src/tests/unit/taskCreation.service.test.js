jest.mock('../../models', () => ({
  CalendarEvent: { findAll: jest.fn(), update: jest.fn() },
  CalendarEventTask: { bulkCreate: jest.fn() },
  Message: { findOne: jest.fn() },
  Notification: { create: jest.fn() },
  Task: {
    create: jest.fn(),
    sequelize: { transaction: jest.fn() }
  },
  User: { findAll: jest.fn(), findOne: jest.fn() },
  WinerySettings: { findOne: jest.fn() }
}));

jest.mock('../../config/logger', () => ({
  info: jest.fn()
}));

jest.mock('../../services/audit.service', () => ({
  logTaskAction: jest.fn()
}));

jest.mock('../../services/customerIdentity.service', () => ({
  buildIntakeIdentityState: jest.fn(),
  getIdentityMatchingConfig: jest.fn(),
  resolveExternalIdentity: jest.fn()
}));

jest.mock('../../services/operationalArea.service', () => ({
  getUserAreaAccess: jest.fn(),
  validateAreaPlacement: jest.fn()
}));

jest.mock('../../services/taskDeadline.service', () => ({
  attachDeadlineState: jest.fn(task => task)
}));

jest.mock('../../services/taskAssignment.service', () => ({
  findManagerUserId: jest.fn(),
  notifyManagerAssignmentReview: jest.fn(),
  notifyTaskAssignee: jest.fn()
}));

jest.mock('../../services/taskArea.service', () => ({
  replaceTaskAreas: jest.fn()
}));

jest.mock('../../services/taskWorkflow.service', () => ({
  createTaskSteps: jest.fn(),
  syncTaskWorkflow: jest.fn()
}));

const { Notification, Task, User, WinerySettings } = require('../../models');
const auditService = require('../../services/audit.service');
const customerIdentityService = require('../../services/customerIdentity.service');
const operationalAreaService = require('../../services/operationalArea.service');
const { replaceTaskAreas } = require('../../services/taskArea.service');
const { createTask } = require('../../services/taskCreation.service');
const { processMentions } = require('../../services/taskMention.service');
const { syncTaskWorkflow } = require('../../services/taskWorkflow.service');

function createTransaction() {
  return {
    commit: jest.fn(),
    rollback: jest.fn(),
    finished: false
  };
}

describe('task creation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    operationalAreaService.validateAreaPlacement.mockResolvedValue({
      areaScope: 'ORGANISATION',
      areaIds: [],
      primaryAreaId: null
    });
    operationalAreaService.getUserAreaAccess.mockResolvedValue({ managedAreaIds: [] });
  });

  it('creates and commits a minimal internal task through its owned transaction', async () => {
    const transaction = createTransaction();
    Task.sequelize.transaction.mockResolvedValue(transaction);
    WinerySettings.findOne.mockResolvedValue({});
    customerIdentityService.getIdentityMatchingConfig.mockReturnValue({});
    customerIdentityService.resolveExternalIdentity.mockResolvedValue({
      memberId: null,
      matchReason: null,
      suggestedCandidates: []
    });
    customerIdentityService.buildIntakeIdentityState.mockReturnValue({
      identityResolutionStatus: 'UNLINKED',
      identityConfidence: 'NONE'
    });
    Task.create.mockImplementation(async values => ({ id: 42, ...values }));

    const result = await createTask({
      wineryId: 1,
      userId: 7,
      userRole: 'manager',
      data: {
        category: 'INTERNAL',
        subType: 'INTERNAL_TASK',
        assigneeId: 7
      }
    });

    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      wineryId: 1,
      category: 'INTERNAL',
      customerType: 'UNKNOWN',
      assigneeId: 7,
      areaScope: 'ORGANISATION',
      payload: expect.objectContaining({
        manualIntake: expect.objectContaining({
          taskOrigin: 'INTERNAL',
          inboundMethod: 'internal'
        })
      })
    }), { transaction });
    expect(replaceTaskAreas).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
    expect(auditService.logTaskAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'MANUAL_CREATED',
      taskId: 42,
      transaction
    }));
    expect(syncTaskWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), transaction);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(42);
  });

  it('rolls back its own transaction when staff assign a new task to another user', async () => {
    const transaction = createTransaction();
    Task.sequelize.transaction.mockResolvedValue(transaction);

    await expect(createTask({
      wineryId: 1,
      userId: 7,
      userRole: 'staff',
      data: { category: 'INTERNAL', assigneeId: 8 }
    })).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(Task.create).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('leaves rollback ownership with the caller when using an injected transaction', async () => {
    const transaction = createTransaction();

    await expect(createTask({
      wineryId: 1,
      userId: 7,
      userRole: 'staff',
      data: { category: 'INTERNAL', assigneeId: 8 },
      transaction
    })).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(Task.sequelize.transaction).not.toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('notifies only named users other than the note sender', async () => {
    const transaction = createTransaction();
    User.findAll.mockResolvedValue([
      { id: 7, displayName: 'Owen' },
      { id: 8, displayName: 'Serena' },
      { id: 9, displayName: 'Alex' }
    ]);

    await processMentions({
      text: 'Please ask @Serena to review this.',
      wineryId: 1,
      senderId: 7,
      taskId: 42,
      transaction
    });

    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith({
      userId: 8,
      type: 'MENTION',
      message: 'You were mentioned in a task note',
      data: { taskId: 42 }
    }, { transaction });
  });

  it('does not query users when text contains no mention marker', async () => {
    await processMentions({
      text: 'No named reviewer yet.',
      wineryId: 1,
      senderId: 7,
      taskId: 42,
      transaction: createTransaction()
    });

    expect(User.findAll).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });
});
