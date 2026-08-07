jest.mock('../../models', () => ({
  Member: { findOne: jest.fn() },
  Task: { findOne: jest.fn() },
  TaskAction: { findOne: jest.fn() }
}));

jest.mock('../../config/logger', () => ({
  info: jest.fn()
}));

jest.mock('../../services/recordVisibility.service', () => ({
  assertCanMutateTask: jest.fn()
}));

const { Member, Task, TaskAction } = require('../../models');
const logger = require('../../config/logger');
const recordVisibility = require('../../services/recordVisibility.service');
const { enrichMemberFromTaskOutcome } = require('../../services/taskMemberEnrichment.service');
const { updateNotePrivacy } = require('../../services/taskNote.service');

describe('task update supporting services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('member outcome enrichment', () => {
    it('does not load a member for internal task outcomes', async () => {
      const result = await enrichMemberFromTaskOutcome({
        memberId: 12,
        payload: { manualIntake: { taskOrigin: 'INTERNAL' } }
      }, {});

      expect(result).toBeNull();
      expect(Member.findOne).not.toHaveBeenCalled();
    });

    it('adds order relationship context and contact history in the update transaction', async () => {
      const transaction = { id: 'task-update' };
      const member = {
        id: 12,
        tags: ['newsletter'],
        notes: 'Existing note',
        source: 'manual',
        save: jest.fn().mockResolvedValue(undefined)
      };
      Member.findOne.mockResolvedValue(member);

      const result = await enrichMemberFromTaskOutcome({
        id: 42,
        wineryId: 3,
        memberId: 12,
        category: 'ORDER',
        payload: { manualIntake: { taskOrigin: 'EXTERNAL' } }
      }, transaction);

      expect(Member.findOne).toHaveBeenCalledWith({
        where: { id: 12, wineryId: 3 },
        transaction
      });
      expect(member.tags).toEqual(['newsletter', 'order_contact', 'order_customer']);
      expect(member.notes).toBe('Existing note\nTask 42 actioned from external order intake.');
      expect(member.lastContactAt).toBeInstanceOf(Date);
      expect(member.save).toHaveBeenCalledWith({ transaction });
      expect(result).toEqual({
        memberId: 12,
        tagsAdded: ['order_contact', 'order_customer'],
        noteAdded: true,
        tagsChanged: true
      });
    });

    it('returns safely when an externally linked member no longer exists', async () => {
      Member.findOne.mockResolvedValue(null);

      const result = await enrichMemberFromTaskOutcome({
        id: 42,
        wineryId: 3,
        memberId: 12,
        category: 'GENERAL',
        payload: { manualIntake: { taskOrigin: 'EXTERNAL' } }
      }, {});

      expect(result).toBeNull();
    });
  });

  describe('note privacy', () => {
    it('allows the note author to change privacy after task visibility is checked', async () => {
      const task = { id: 42, wineryId: 3 };
      const action = {
        id: 9,
        userId: 7,
        details: { note: 'Follow up tomorrow' },
        changed: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined)
      };
      Task.findOne.mockResolvedValue(task);
      TaskAction.findOne.mockResolvedValue(action);

      const result = await updateNotePrivacy({
        taskId: 42,
        actionId: 9,
        wineryId: 3,
        userId: 7,
        userRole: 'staff',
        isPrivate: true
      });

      expect(recordVisibility.assertCanMutateTask).toHaveBeenCalledWith(task, {
        wineryId: 3,
        userId: 7,
        userRole: 'staff'
      });
      expect(action.details).toEqual({ note: 'Follow up tomorrow', isPrivate: true });
      expect(action.changed).toHaveBeenCalledWith('details', true);
      expect(action.save).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Note privacy toggled', {
        actionId: 9,
        taskId: 42,
        isPrivate: true,
        userId: 7
      });
      expect(result).toBe(action);
    });

    it('prevents staff from changing another author\'s note privacy', async () => {
      Task.findOne.mockResolvedValue({ id: 42, wineryId: 3 });
      const action = {
        id: 9,
        userId: 8,
        details: {},
        changed: jest.fn(),
        save: jest.fn()
      };
      TaskAction.findOne.mockResolvedValue(action);

      await expect(updateNotePrivacy({
        taskId: 42,
        actionId: 9,
        wineryId: 3,
        userId: 7,
        userRole: 'staff',
        isPrivate: true
      })).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(action.changed).not.toHaveBeenCalled();
      expect(action.save).not.toHaveBeenCalled();
    });
  });
});
