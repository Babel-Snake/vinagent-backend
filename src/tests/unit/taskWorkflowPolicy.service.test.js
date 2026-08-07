const {
  STAFF_ASSIGNMENT_REVIEW_REASON,
  appendMemberNote,
  applyTaskOutcomeUpdates,
  assertCanMutateTaskStep,
  isStaffAssignmentReviewStep,
  normalizeTaskStepInput,
  previewText,
  sanitizeTextOrNull
} = require('../../services/taskWorkflowPolicy.service');

describe('taskWorkflowPolicy service', () => {
  test('enforces step ownership while preserving manager override', () => {
    expect(() => assertCanMutateTaskStep({
      task: { assigneeId: 4 }, step: { ownerUserId: 7 }, userId: 4, userRole: 'staff'
    })).toThrow('assigned to another staff member');

    expect(() => assertCanMutateTaskStep({
      task: { assigneeId: 4 }, step: { ownerUserId: 7 }, userId: 4, userRole: 'manager'
    })).not.toThrow();

    try {
      assertCanMutateTaskStep({ task: {}, userId: null, userRole: 'staff' });
    } catch (error) {
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('STEP_ACTION_FORBIDDEN');
    }
  });

  test('normalizes workflow inputs and rejects unsupported suggestion channels', () => {
    const normalized = normalizeTaskStepInput({
      title: '  Call customer  ',
      description: '  Confirm delivery  ',
      suggestedChannel: 'carrier-pigeon'
    }, 2, 9);

    expect(normalized).toMatchObject({
      title: 'Call customer',
      description: 'Confirm delivery',
      ownerUserId: 9,
      sortOrder: 2,
      suggestedChannel: null
    });
    expect(normalizeTaskStepInput({ title: 'Reply', suggestedChannel: 'email' }).suggestedChannel).toBe('email');
  });

  test('recognizes assignment-review metadata and keeps member notes idempotent', () => {
    expect(isStaffAssignmentReviewStep({ metadata: JSON.stringify({ reason: STAFF_ASSIGNMENT_REVIEW_REASON }) })).toBe(true);
    expect(isStaffAssignmentReviewStep({ metadata: '{invalid' })).toBe(false);
    expect(appendMemberNote('Existing', 'New note')).toBe('Existing\nNew note');
    expect(appendMemberNote('Existing\nNew note', 'New note')).toBe('Existing\nNew note');
  });

  test('applies and clears structured task outcomes deterministically', () => {
    const task = { category: 'BOOKING', status: 'ACTIONED' };
    const closedDiff = applyTaskOutcomeUpdates(task, {
      resolutionSummary: '  Booking confirmed  ',
      followUpRequired: true,
      followUpSummary: '  Call tomorrow  '
    }, 'ACTIONED');

    expect(task).toMatchObject({
      resolvedAs: 'COMPLETED',
      resolutionType: 'EXECUTED',
      customerOutcome: 'BOOKING_CONFIRMED',
      resolutionSummary: 'Booking confirmed',
      followUpRequired: true,
      followUpSummary: 'Call tomorrow'
    });
    expect(closedDiff.changes.resolvedAs).toBe('COMPLETED');

    const reopenDiff = applyTaskOutcomeUpdates(task, {}, 'PENDING');
    expect(task.resolvedAs).toBeNull();
    expect(task.followUpRequired).toBe(false);
    expect(reopenDiff.oldValues.resolvedAs).toBe('COMPLETED');
  });

  test('provides consistent text sanitization and previews', () => {
    expect(sanitizeTextOrNull('   ')).toBeNull();
    expect(sanitizeTextOrNull('  useful  ')).toBe('useful');
    expect(previewText('one    two', 20)).toBe('one two');
  });
});
