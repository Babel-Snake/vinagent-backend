const { classifyItem } = require('../../services/involvement.service');

describe('involvement service', () => {
  const viewer = { userId: 23, userRole: 'staff', areaIds: [4, 7] };

  test('marks personal ownership and recipients as direct involvement', () => {
    expect(classifyItem('TASK', { assigneeId: 23 }, viewer)).toEqual({ kind: 'DIRECT', reason: 'ASSIGNEE' });
    expect(classifyItem('REQUEST', { requestedFromUserId: 23 }, viewer)).toEqual({ kind: 'DIRECT', reason: 'REQUESTED_FROM' });
    expect(classifyItem('NOTE', { Recipients: [{ id: 23 }] }, viewer)).toEqual({ kind: 'DIRECT', reason: 'RECIPIENT' });
    expect(classifyItem('NOTICE', { audienceType: 'users', audienceUserIds: [18, 23] }, viewer)).toEqual({ kind: 'DIRECT', reason: 'AUDIENCE' });
  });

  test('uses the softer area signal only when no direct relationship exists', () => {
    const sharedArea = { OperationalAreas: [{ id: 7 }] };
    expect(classifyItem('TASK', { assigneeId: 18, ...sharedArea }, viewer)).toEqual({ kind: 'AREA', reason: 'AREA' });
    expect(classifyItem('NOTE', { Recipients: [{ id: 18 }], ...sharedArea }, viewer)).toEqual({ kind: 'AREA', reason: 'AREA' });
    expect(classifyItem('NOTICE', { audienceType: 'roles', audienceRoles: ['staff'] }, viewer)).toEqual({ kind: 'AREA', reason: 'ROLE' });
  });

  test('does not highlight general organisation-wide records', () => {
    expect(classifyItem('NOTICE', { audienceType: 'all_staff', OperationalAreas: [] }, viewer)).toBeNull();
    expect(classifyItem('TASK', { assigneeId: null, OperationalAreas: [] }, viewer)).toBeNull();
  });

  test('derives calendar relevance from linked work before event authorship', () => {
    expect(classifyItem('CALENDAR_EVENT', {
      createdBy: 18,
      LinkedTasks: [{ assigneeId: 23 }]
    }, viewer)).toEqual({ kind: 'DIRECT', reason: 'LINKED_WORK' });

    expect(classifyItem('CALENDAR_EVENT', {
      createdBy: 23,
      LinkedTasks: []
    }, viewer)).toEqual({ kind: 'DIRECT', reason: 'CREATOR' });
  });
});
