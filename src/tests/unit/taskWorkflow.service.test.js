jest.mock('../../models', () => ({
  TaskStep: {
    findAll: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../../services/audit.service', () => ({
  logTaskAction: jest.fn()
}));

const { TaskStep } = require('../../models');
const {
  buildWorkflowSummary,
  syncTaskWorkflow
} = require('../../services/taskWorkflow.service');

describe('taskWorkflow service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks rejected tasks as cancelled even when workflow steps remain', () => {
    const resolvedAt = new Date('2026-07-01T00:00:00.000Z');
    const summary = buildWorkflowSummary(
      { status: 'REJECTED', resolvedAt },
      [{ status: 'IN_PROGRESS', waitingOn: 'STAFF', title: 'Old active step' }]
    );

    expect(summary).toEqual({
      workflowState: 'CANCELLED',
      waitingOn: 'NONE',
      nextStepSummary: null,
      blockedReason: null,
      dueAt: null,
      resolvedAt
    });
  });

  it('prioritises blocked work and preserves its reason', () => {
    const summary = buildWorkflowSummary(
      { status: 'PENDING', blockedReason: 'Task fallback reason' },
      [
        { status: 'IN_PROGRESS', waitingOn: 'NONE', title: 'Work in progress' },
        {
          status: 'BLOCKED',
          waitingOn: 'EXTERNAL',
          title: 'Wait for provider',
          blockedReason: 'Provider is offline'
        }
      ]
    );

    expect(summary).toMatchObject({
      workflowState: 'BLOCKED',
      waitingOn: 'EXTERNAL',
      nextStepSummary: 'Wait for provider',
      blockedReason: 'Provider is offline'
    });
  });

  it('uses the nearest active due date when the focus step has none', () => {
    const laterDueAt = new Date('2026-07-20T00:00:00.000Z');
    const nearestDueAt = new Date('2026-07-10T00:00:00.000Z');
    const summary = buildWorkflowSummary(
      { status: 'PENDING' },
      [
        { status: 'IN_PROGRESS', waitingOn: 'NONE', title: 'Current work', dueAt: null },
        { status: 'PENDING', waitingOn: 'NONE', title: 'Later work', dueAt: laterDueAt },
        { status: 'PENDING', waitingOn: 'NONE', title: 'Sooner work', dueAt: nearestDueAt }
      ]
    );

    expect(summary.workflowState).toBe('IN_PROGRESS');
    expect(summary.dueAt).toBe(nearestDueAt);
  });

  it('persists the derived workflow fields in the supplied transaction', async () => {
    const transaction = { id: 'workflow-transaction' };
    const steps = [{ status: 'PENDING', waitingOn: 'CUSTOMER', title: 'Confirm details' }];
    const task = {
      id: 42,
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined)
    };
    TaskStep.findAll.mockResolvedValue(steps);

    const result = await syncTaskWorkflow(task, transaction);

    expect(TaskStep.findAll).toHaveBeenCalledWith({
      where: { taskId: 42 },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
      transaction
    });
    expect(task).toMatchObject({
      workflowState: 'WAITING',
      waitingOn: 'CUSTOMER',
      nextStepSummary: 'Confirm details'
    });
    expect(task.save).toHaveBeenCalledWith({ transaction });
    expect(result.steps).toBe(steps);
  });
});
