jest.mock('../../models', () => ({
  Member: {},
  Message: {},
  Task: { findOne: jest.fn() },
  TaskAction: { findAll: jest.fn() },
  TaskStep: {},
  User: { findOne: jest.fn() }
}));

jest.mock('../../config/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

jest.mock('../../services/ai', () => ({
  classify: jest.fn()
}));

const { Task, User } = require('../../models');
const aiService = require('../../services/ai');
const { generateAiSuggestion } = require('../../services/aiSuggestion.service');

describe('AI suggestion tenant scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not persist an AI-suggested assignee outside the task winery', async () => {
    const task = {
      id: 44,
      wineryId: 1,
      category: 'GENERAL',
      subType: 'GENERAL_ENQUIRY',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      payload: { originalText: 'Please follow up.' },
      suggestedChannel: 'none',
      assigneeId: null,
      Messages: [],
      TaskSteps: [],
      save: jest.fn().mockResolvedValue(undefined)
    };
    Task.findOne.mockResolvedValue(task);
    User.findOne.mockResolvedValue(null);
    aiService.classify.mockResolvedValue({
      suggestedReply: 'Draft reply',
      suggestedAssigneeId: 9002
    });

    await generateAiSuggestion(task.id, task.wineryId, { force: true });

    expect(User.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9002, wineryId: 1 }
    }));
    expect(task.assigneeId).toBeNull();
    expect(task.suggestedReplyBody).toMatch(/^\[AI Error:/);
    expect(Task.findOne).toHaveBeenLastCalledWith({
      where: { id: task.id, wineryId: task.wineryId }
    });
  });
});
