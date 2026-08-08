process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  Attachment,
  CalendarEvent,
  Notice,
  Notification,
  OperationalArea,
  OperationalRecord,
  OperationalRequest,
  Project,
  ProjectAuditEvent,
  ProjectItem,
  ProjectParticipant,
  ProjectTaskDependency,
  Task,
  TaskArea,
  User,
  UserAreaMembership,
  Winery
} = require('../../models');

describe('Project routes', () => {
  const auth = 'Bearer mock-token';
  let areaA;
  let areaB;

  const future = (days = 14) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  async function createProject(overrides = {}) {
    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({
        title: `Project ${Date.now()} ${Math.random()}`,
        intendedOutcome: 'Deliver the agreed operational outcome.',
        status: 'ACTIVE',
        ownerUserId: 7,
        targetEndAt: future(),
        areaScope: 'AREAS',
        primaryAreaId: areaA.id,
        ...overrides
      });
    return response;
  }

  async function createTask(overrides = {}) {
    const task = await Task.create({
      wineryId: 1,
      category: 'OPERATIONS',
      subType: 'PROJECT_ACTION',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      priority: 'normal',
      areaScope: 'AREAS',
      payload: { summary: `Project Task ${Date.now()} ${Math.random()}` },
      createdBy: 7,
      updatedBy: 7,
      ...overrides
    });
    await TaskArea.create({
      wineryId: task.wineryId,
      taskId: task.id,
      areaId: overrides.wineryId === 2 ? null : areaA.id,
      relationshipType: 'PRIMARY'
    }).catch(() => {});
    return task;
  }

  function linkItem(projectId, data) {
    return request(app)
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', auth)
      .send(data);
  }

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.create({ id: 1, name: 'Projects Winery', timeZone: 'Australia/Adelaide' });
    await Winery.create({ id: 2, name: 'Other Winery', timeZone: 'Australia/Adelaide' });
    await User.bulkCreate([
      {
        id: 7,
        firebaseUid: 'projects-current-user',
        email: 'stub@example.com',
        displayName: 'Current Manager',
        role: 'manager',
        wineryId: 1
      },
      {
        id: 8,
        firebaseUid: 'projects-participant',
        email: 'participant@example.com',
        displayName: 'Project Participant',
        role: 'staff',
        wineryId: 1
      },
      {
        id: 10,
        firebaseUid: 'projects-area-manager',
        email: 'area.manager@example.com',
        displayName: 'Area Manager',
        role: 'staff',
        wineryId: 1
      },
      {
        id: 9,
        firebaseUid: 'projects-other-manager',
        email: 'other.manager@example.com',
        displayName: 'Other Manager',
        role: 'manager',
        wineryId: 2
      },
      {
        id: 11,
        firebaseUid: 'projects-marketing-member',
        email: 'marketing.member@example.com',
        displayName: 'Marketing Coordinator',
        role: 'staff',
        wineryId: 1
      },
      {
        id: 12,
        firebaseUid: 'projects-marketing-manager',
        email: 'marketing.manager@example.com',
        displayName: 'Marketing Manager',
        role: 'staff',
        wineryId: 1
      },
      {
        id: 13,
        firebaseUid: 'projects-accountable-owner',
        email: 'accountable.owner@example.com',
        displayName: 'General Manager',
        role: 'manager',
        wineryId: 1
      }
    ]);
    areaA = await OperationalArea.create({ wineryId: 1, name: 'Cellar Door', sortOrder: 1 });
    areaB = await OperationalArea.create({ wineryId: 1, name: 'Logistics', sortOrder: 2 });
    await UserAreaMembership.bulkCreate([
      { wineryId: 1, userId: 8, areaId: areaA.id, membershipRole: 'MEMBER', isPrimary: true },
      { wineryId: 1, userId: 10, areaId: areaA.id, membershipRole: 'MANAGER', isPrimary: true },
      { wineryId: 1, userId: 11, areaId: areaB.id, membershipRole: 'MEMBER', isPrimary: true },
      { wineryId: 1, userId: 12, areaId: areaB.id, membershipRole: 'MANAGER', isPrimary: true }
    ]);
  });

  beforeEach(async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    await UserAreaMembership.destroy({ where: { userId: 7 } });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('creates, lists, and loads an area Project with owner, participants, summary, audit, and notification state', async () => {
    const created = await createProject({
      title: '2027 Autumn Wine Club Release',
      participantUserIds: [8],
      businessContext: 'Coordinate allocation, packing, customer communication, and pickup.'
    });

    expect(created.status).toBe(201);
    expect(created.body.project.title).toBe('2027 Autumn Wine Club Release');
    expect(created.body.project.Owner.id).toBe(7);
    expect(created.body.project.primaryAreaId).toBe(areaA.id);
    expect(created.body.project.Participants.map(item => item.User.id)).toContain(8);
    expect(created.body.project.summary.progressPercent).toBeNull();
    expect(created.body.project.summary.health).toBe('ON_TRACK');

    const projectId = created.body.project.id;
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'CREATED' } })).toBe(1);
    expect(await Notification.count({ where: { userId: 8, type: 'SYSTEM' } })).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/projects/${projectId}/participants/8`)
      .set('Authorization', auth)
      .send({ participationRole: 'STAKEHOLDER', notificationsEnabled: false })
      .expect(200);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'PARTICIPANT_UPDATED' } })).toBe(1);

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ areaScope: 'AREAS', primaryAreaId: areaB.id, linkedAreaIds: [areaA.id] })
      .expect(200);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'AREA_CHANGED' } })).toBe(1);

    const list = await request(app)
      .get('/api/projects?search=Autumn&pageSize=10')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.projects.map(project => project.id)).toContain(projectId);
    expect(list.body.pagination.total).toBeGreaterThan(0);

    const detail = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.project.id).toBe(projectId);
    expect(detail.body.project.restrictedItemCount).toBe(0);
  });

  test('filters open Projects by personal involvement and explains each connection', async () => {
    const prefix = `Home involvement ${Date.now()}`;
    const owner = await createProject({
      title: `${prefix} owner`,
      status: 'PLANNED',
      plannedStartAt: future(7)
    });
    expect(owner.status).toBe(201);

    const lead = await createProject({
      title: `${prefix} lead`,
      ownerUserId: 13,
      leadUserId: 7,
      areaScope: 'ORGANISATION',
      primaryAreaId: null
    });
    expect(lead.status).toBe(201);

    const participant = await createProject({
      title: `${prefix} participant`,
      ownerUserId: 13,
      participantUserIds: [7]
    });
    expect(participant.status).toBe(201);

    const delegated = await createProject({
      title: `${prefix} delegated task`,
      ownerUserId: 13
    });
    expect(delegated.status).toBe(201);
    const delegatedTask = await createTask({ assigneeId: 7 });
    await ProjectItem.create({
      wineryId: 1,
      projectId: delegated.body.project.id,
      itemType: 'TASK',
      itemId: delegatedTask.id,
      linkType: 'DELEGATED_WORK',
      isRequired: true,
      isMilestone: false,
      sortOrder: 10,
      addedBy: 13
    });

    const unrelated = await createProject({
      title: `${prefix} visible but unrelated`,
      ownerUserId: 13
    });
    expect(unrelated.status).toBe(201);
    const closed = await createProject({
      title: `${prefix} closed owner`,
      status: 'PLANNED'
    });
    expect(closed.status).toBe(201);
    await request(app)
      .patch(`/api/projects/${closed.body.project.id}`)
      .set('Authorization', auth)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const response = await request(app)
      .get('/api/projects')
      .query({ search: prefix, status: 'open', involvement: 'me', pageSize: 20 })
      .set('Authorization', auth)
      .expect(200);

    const byId = new Map(response.body.projects.map(project => [project.id, project]));
    expect(byId.has(owner.body.project.id)).toBe(true);
    expect(byId.has(lead.body.project.id)).toBe(true);
    expect(byId.has(participant.body.project.id)).toBe(true);
    expect(byId.has(delegated.body.project.id)).toBe(true);
    expect(byId.has(unrelated.body.project.id)).toBe(false);
    expect(byId.has(closed.body.project.id)).toBe(false);
    expect(byId.get(owner.body.project.id).involvement.roles).toContain('OWNER');
    expect(byId.get(lead.body.project.id).involvement.roles).toContain('LEAD');
    expect(byId.get(participant.body.project.id).involvement.roles).toContain('PARTICIPANT');
    expect(byId.get(delegated.body.project.id).involvement).toEqual({
      roles: ['DELEGATED_TASK_ASSIGNEE'],
      primaryRole: 'DELEGATED_TASK_ASSIGNEE',
      delegatedTaskCount: 1
    });
  });

  test('lets an area manager coordinate only Projects wholly inside managed areas', async () => {
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    await UserAreaMembership.create({
      wineryId: 1,
      userId: 7,
      areaId: areaA.id,
      membershipRole: 'MANAGER',
      isPrimary: true
    });

    const users = await request(app)
      .get('/api/users')
      .set('Authorization', auth)
      .expect(200);
    expect(users.body.users.find(user => user.id === 7).managedAreaIds).toContain(areaA.id);

    await createProject({ title: 'Area-owned release' }).then(response => expect(response.status).toBe(201));

    await createProject({
      title: 'Unmanaged logistics project',
      primaryAreaId: areaB.id
    }).then(response => expect(response.status).toBe(403));

    await createProject({
      title: 'Organisation project',
      areaScope: 'ORGANISATION',
      primaryAreaId: null,
      ownerUserId: 7
    }).then(response => expect(response.status).toBe(403));
  });

  test('links every supported item type and derives progress, decisions, upcoming work, and reverse navigation', async () => {
    const projectResponse = await createProject({ title: 'Full linked-item Project' });
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const task = await createTask({ status: 'ACTIONED', workflowState: 'IN_PROGRESS', dueAt: future(4), assigneeId: 7 });
    const requestItem = await OperationalRequest.create({
      wineryId: 1,
      title: 'Approve replacement wine',
      body: 'Management must confirm the replacement wine.',
      status: 'PENDING',
      priority: 'high',
      sourceType: 'MANUAL',
      areaScope: 'ORGANISATION',
      dueAt: future(2),
      humanConfirmedType: 'REQUEST',
      confirmedBy: 7,
      confirmedAt: new Date(),
      createdBy: 7,
      updatedBy: 7
    });
    const notice = await Notice.create({
      wineryId: 1,
      title: 'Pickup instructions changed',
      body: 'Use the eastern collection entrance.',
      areaScope: 'ORGANISATION',
      createdBy: 7,
      updatedBy: 7
    });
    const note = await OperationalRecord.create({
      wineryId: 1,
      title: 'Release planning context',
      body: 'Last release required additional packing benches.',
      sourceType: 'MANUAL',
      occurredAt: new Date(),
      areaScope: 'ORGANISATION',
      humanConfirmedType: 'NOTE',
      confirmedBy: 7,
      confirmedAt: new Date(),
      createdBy: 7,
      updatedBy: 7
    });
    const event = await CalendarEvent.create({
      wineryId: 1,
      title: 'Packing day',
      start: future(5),
      end: future(5),
      allDay: true,
      type: 'event',
      createdBy: 7
    });

    await linkItem(projectId, { itemType: 'TASK', itemId: task.id, isRequired: true }).expect(201);
    await linkItem(projectId, { itemType: 'REQUEST', itemId: requestItem.id }).expect(201);
    await linkItem(projectId, { itemType: 'NOTICE', itemId: notice.id }).expect(201);
    await linkItem(projectId, { itemType: 'NOTE', itemId: note.id }).expect(201);
    await linkItem(projectId, { itemType: 'CALENDAR_EVENT', itemId: event.id, isMilestone: true }).expect(201);

    const deepLinkedEvent = await request(app)
      .get(`/api/calendar?eventId=${event.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(deepLinkedEvent.body.map(item => item.id)).toEqual([event.id]);
    await request(app)
      .get('/api/calendar?eventId=not-a-number')
      .set('Authorization', auth)
      .expect(400);

    const invalidRequired = await linkItem(projectId, { itemType: 'NOTICE', itemId: notice.id, isRequired: true });
    expect(invalidRequired.status).toBe(400);

    const detail = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(new Set(detail.body.project.items.map(item => item.itemType))).toEqual(
      new Set(['TASK', 'REQUEST', 'NOTICE', 'NOTE', 'CALENDAR_EVENT'])
    );
    const itemsByType = new Map(detail.body.project.items.map(item => [item.itemType, item]));
    expect(itemsByType.get('TASK').source.involvement).toEqual({ kind: 'DIRECT', reason: 'ASSIGNEE' });
    expect(itemsByType.get('CALENDAR_EVENT').source.involvement).toEqual({ kind: 'DIRECT', reason: 'CREATOR' });
    expect(detail.body.project.summary.requiredTaskCount).toBe(1);
    expect(detail.body.project.summary.completedRequiredTaskCount).toBe(0);
    expect(detail.body.project.summary.progressPercent).toBe(0);
    expect(detail.body.project.summary.pendingDecisionCount).toBe(1);
    expect(detail.body.project.summary.upcomingMilestone.itemType).toBe('CALENDAR_EVENT');

    await task.update({ workflowState: 'COMPLETED' });
    const completed = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(completed.body.project.summary.progressPercent).toBe(100);

    const reverse = await request(app)
      .get(`/api/projects/for-item?itemType=TASK&itemId=${task.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(reverse.body.projects.map(project => project.id)).toContain(projectId);

    const noticeLink = await ProjectItem.findOne({ where: { projectId, itemType: 'NOTICE', itemId: notice.id } });
    await request(app)
      .delete(`/api/projects/${projectId}/items/${noticeLink.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(await Notice.count({ where: { id: notice.id } })).toBe(1);
  });

  test('rejects cross-winery item membership', async () => {
    const projectResponse = await createProject({ title: 'Tenant-safe Project' });
    const otherTask = await Task.create({
      wineryId: 2,
      category: 'OPERATIONS',
      subType: 'OTHER_WINERY_TASK',
      status: 'PENDING',
      priority: 'normal',
      areaScope: 'ORGANISATION',
      createdBy: 9,
      updatedBy: 9
    });

    const response = await linkItem(projectResponse.body.project.id, {
      itemType: 'TASK',
      itemId: otherTask.id,
      isRequired: true
    });
    expect(response.status).toBe(404);
  });

  test('does not expose foreign users through legacy Project and linked-item associations', async () => {
    const project = await Project.create({
      wineryId: 1,
      title: 'Legacy association boundary',
      intendedOutcome: 'Keep all related identities inside the owning winery.',
      status: 'ACTIVE',
      areaScope: 'ORGANISATION',
      ownerUserId: 9,
      createdBy: 9,
      updatedBy: 9
    });
    const task = await Task.create({
      wineryId: 1,
      category: 'OPERATIONS',
      subType: 'LEGACY_ASSOCIATION',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      priority: 'normal',
      areaScope: 'ORGANISATION',
      assigneeId: 9,
      createdBy: 9,
      updatedBy: 9
    });
    const requestItem = await OperationalRequest.create({
      wineryId: 1,
      title: 'Legacy requested person',
      body: 'This local request has an invalid foreign requested-person link.',
      status: 'PENDING',
      priority: 'normal',
      sourceType: 'MANUAL',
      areaScope: 'ORGANISATION',
      requestedFromUserId: 9,
      humanConfirmedType: 'REQUEST',
      confirmedBy: 9,
      confirmedAt: new Date(),
      createdBy: 9,
      updatedBy: 9
    });
    const event = await CalendarEvent.create({
      wineryId: 1,
      title: 'Legacy creator mismatch',
      start: future(3),
      end: future(3),
      allDay: true,
      type: 'event',
      createdBy: 9
    });
    await ProjectItem.bulkCreate([
      { wineryId: 1, projectId: project.id, itemType: 'TASK', itemId: task.id, sortOrder: 0, addedBy: 9 },
      { wineryId: 1, projectId: project.id, itemType: 'REQUEST', itemId: requestItem.id, sortOrder: 1, addedBy: 9 },
      { wineryId: 1, projectId: project.id, itemType: 'CALENDAR_EVENT', itemId: event.id, sortOrder: 2, addedBy: 9 }
    ]);

    const detail = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.project.Owner).toBeNull();
    expect(detail.body.project.Creator).toBeNull();
    for (const item of detail.body.project.items) {
      expect(item.AddedBy).toBeNull();
      expect(item.addedBy).toBeNull();
      expect(item.source.owner).toBeNull();
    }
    expect(detail.body.project.ownerUserId).toBeNull();
    expect(detail.body.project.createdBy).toBeNull();
    expect(JSON.stringify(detail.body)).not.toContain('other.manager@example.com');

    const notificationProject = await Project.create({
      wineryId: 1,
      title: 'Tenant-safe notification recipients',
      intendedOutcome: 'Do not notify users outside this winery.',
      status: 'ACTIVE',
      areaScope: 'ORGANISATION',
      ownerUserId: 7,
      targetEndAt: future(30),
      createdBy: 7,
      updatedBy: 7
    });
    await ProjectParticipant.create({
      wineryId: 1,
      projectId: notificationProject.id,
      userId: 9,
      participationRole: 'PARTICIPANT',
      notificationsEnabled: true,
      addedBy: 7
    });
    await request(app)
      .patch(`/api/projects/${notificationProject.id}`)
      .set('Authorization', auth)
      .send({ businessContext: 'A tenant-safe update.', notifyParticipants: true })
      .expect(200);
    expect(await Notification.count({ where: { userId: 9 } })).toBe(0);

    const calendar = await request(app)
      .get(`/api/calendar?eventId=${event.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(calendar.body[0].Creator).toBeNull();
    expect(JSON.stringify(calendar.body)).not.toContain('other.manager@example.com');
  });

  test('does not expose unexpected calendar errors to clients', async () => {
    const sensitiveMessage = 'database password appeared in a provider diagnostic';
    const findAll = jest.spyOn(CalendarEvent, 'findAll').mockRejectedValueOnce(new Error(sensitiveMessage));
    try {
      const response = await request(app)
        .get('/api/calendar')
        .set('Authorization', auth)
        .expect(500);
      expect(response.body.error.message).toBe('An unexpected error occurred');
      expect(JSON.stringify(response.body)).not.toContain(sensitiveMessage);
    } finally {
      findAll.mockRestore();
    }
  });

  test('guards completion with unresolved required work and records a human override', async () => {
    const projectResponse = await createProject({ title: 'Completion guard Project' });
    const projectId = projectResponse.body.project.id;
    const task = await createTask({ workflowState: 'BLOCKED', blockedReason: 'Awaiting supplier' });
    await linkItem(projectId, { itemType: 'TASK', itemId: task.id, isRequired: true }).expect(201);

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ status: 'COMPLETED' })
      .expect(400);

    const completed = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({
        status: 'COMPLETED',
        completionOverride: true,
        completionReason: 'Management accepted the supplier exception.'
      })
      .expect(200);
    expect(completed.body.project.status).toBe('COMPLETED');
    expect(completed.body.project.actualCompletedAt).toBeTruthy();
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'COMPLETION_OVERRIDDEN' } })).toBe(1);

    const reopened = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(reopened.body.project.actualCompletedAt).toBeNull();
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'REOPENED' } })).toBe(1);
  });

  test('creates Task dependencies, rejects cycles, and removes edges when membership is removed', async () => {
    const projectResponse = await createProject({ title: 'Dependency Project' });
    const projectId = projectResponse.body.project.id;
    const taskA = await createTask();
    const taskB = await createTask();
    const taskC = await createTask();
    for (const task of [taskA, taskB, taskC]) {
      await linkItem(projectId, { itemType: 'TASK', itemId: task.id, isRequired: true }).expect(201);
    }

    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set('Authorization', auth)
      .send({ blockingTaskId: taskA.id, blockedTaskId: taskB.id })
      .expect(201);
    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set('Authorization', auth)
      .send({ blockingTaskId: taskB.id, blockedTaskId: taskC.id })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set('Authorization', auth)
      .send({ blockingTaskId: taskC.id, blockedTaskId: taskA.id })
      .expect(400);
    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set('Authorization', auth)
      .send({ blockingTaskId: taskA.id, blockedTaskId: taskA.id })
      .expect(400);

    const taskBLink = await ProjectItem.findOne({ where: { projectId, itemType: 'TASK', itemId: taskB.id } });
    await request(app)
      .delete(`/api/projects/${projectId}/items/${taskBLink.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(await ProjectTaskDependency.count({ where: { projectId } })).toBe(0);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'DEPENDENCY_REMOVED' } })).toBe(2);
  });

  test('supports Project attachments and exposes ordered Project activity', async () => {
    const projectResponse = await createProject({ title: 'Project files and history' });
    const projectId = projectResponse.body.project.id;

    await request(app)
      .post('/api/attachments')
      .set('Authorization', auth)
      .send({
        entityType: 'PROJECT',
        entityId: projectId,
        filename: 'release-brief.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('release coordination brief').toString('base64')
      })
      .expect(201);

    expect(await Attachment.count({ where: { entityType: 'PROJECT', entityId: projectId } })).toBe(1);

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ riskReason: 'Packaging lead time is uncertain.', riskReviewAt: future(2) })
      .expect(200);

    const activity = await request(app)
      .get(`/api/projects/${projectId}/activity`)
      .set('Authorization', auth)
      .expect(200);
    expect(activity.body.activity.some(event => event.eventType === 'ATTACHMENT_ADDED')).toBe(true);
    expect(activity.body.activity.some(event => event.eventType === 'RISK_CHANGED')).toBe(true);
    const timestamps = activity.body.activity.map(event => new Date(event.createdAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((left, right) => right - left));
  });

  test('scopes a delegated Project Lead across participating departments and revokes that authority cleanly', async () => {
    await UserAreaMembership.create({
      wineryId: 1,
      userId: 7,
      areaId: areaA.id,
      membershipRole: 'MEMBER',
      isPrimary: true
    });
    const created = await createProject({
      title: 'Festival collaboration Project',
      ownerUserId: 13,
      primaryAreaId: areaA.id,
      linkedAreaIds: [areaB.id]
    });
    expect(created.status).toBe(201);
    const projectId = created.body.project.id;

    const appointed = await request(app)
      .put(`/api/projects/${projectId}/lead`)
      .set('Authorization', auth)
      .send({ leadUserId: 7 })
      .expect(200);
    expect(appointed.body.project.Lead.id).toBe(7);
    expect(appointed.body.project.Owner.id).toBe(13);
    expect(appointed.body.project.LeadGrantor.id).toBe(7);
    expect(appointed.body.project.permissions.canGovern).toBe(true);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'LEAD_ASSIGNED' } })).toBe(1);

    await User.update({ role: 'staff' }, { where: { id: 7 } });
    const asLead = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(asLead.body.project.permissions).toEqual(expect.objectContaining({
      canManage: true,
      canGovern: false,
      isLead: true,
      canDelegateTasks: true
    }));

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ riskReason: 'Weather contingency requires weekly review.' })
      .expect(200);
    await request(app)
      .post(`/api/projects/${projectId}/participants`)
      .set('Authorization', auth)
      .send({ userId: 11, participationRole: 'PARTICIPANT', notificationsEnabled: true })
      .expect(201);

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ ownerUserId: 10 })
      .expect(403);
    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ status: 'COMPLETED' })
      .expect(403);
    await request(app)
      .put(`/api/projects/${projectId}/lead`)
      .set('Authorization', auth)
      .send({ leadUserId: 8 })
      .expect(403);

    await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', auth)
      .send({
        title: 'Schedule the Festival campaign',
        body: 'Coordinate the campaign launch with Restaurant and Cellar Door timings.',
        dueAt: future(7),
        priority: 'high',
        areaId: areaB.id,
        assigneeId: 8,
        isRequired: true,
        isMilestone: true
      })
      .expect(400);

    const delegated = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', auth)
      .send({
        title: 'Schedule the Festival campaign',
        body: 'Coordinate the campaign launch with Restaurant and Cellar Door timings.',
        dueAt: future(7),
        priority: 'high',
        areaId: areaB.id,
        assigneeId: 11,
        isRequired: true,
        isMilestone: true
      })
      .expect(201);
    const taskId = delegated.body.taskId;
    const task = await Task.findByPk(taskId);
    expect(task.createdBy).toBe(13);
    expect(task.assigneeId).toBe(11);
    expect(task.payload).toEqual(expect.objectContaining({
      projectId,
      delegatedByUserId: 7,
      delegatedAreaId: areaB.id
    }));
    expect(await TaskArea.count({ where: { taskId, areaId: areaB.id } })).toBe(1);
    expect(await ProjectItem.count({ where: { projectId, itemId: taskId, linkType: 'DELEGATED_WORK' } })).toBe(1);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'TASK_DELEGATED' } })).toBe(1);
    expect(await Notification.count({ where: { userId: 12, type: 'SYSTEM' } })).toBeGreaterThan(0);

    await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', auth)
      .expect(200);

    await User.update({ role: 'manager' }, { where: { id: 7 } });
    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .send({ status: 'CANCELLED' })
      .expect(200);
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    const closedAsLead = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(closedAsLead.body.project.permissions).toEqual(expect.objectContaining({
      canManage: false,
      isLead: true,
      canDelegateTasks: false
    }));
    await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', auth)
      .send({ title: 'Closed Project Task', areaId: areaA.id, assigneeId: 8 })
      .expect(403);
    await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', auth)
      .expect(404);

    await User.update({ role: 'manager' }, { where: { id: 7 } });
    await request(app)
      .delete(`/api/projects/${projectId}/lead`)
      .set('Authorization', auth)
      .expect(200);
    expect(await ProjectAuditEvent.count({ where: { projectId, eventType: 'LEAD_REVOKED' } })).toBe(1);

    await User.update({ role: 'staff' }, { where: { id: 7 } });
    const afterRevocation = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(afterRevocation.body.project.permissions).toEqual(expect.objectContaining({
      canManage: false,
      canGovern: false,
      isLead: false,
      canDelegateTasks: false
    }));
    await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', auth)
      .expect(404);
  });

  test('does not reveal an inaccessible Project through reverse item lookup', async () => {
    const task = await createTask({ createdBy: 7, updatedBy: 7 });
    const hiddenProject = await Project.create({
      wineryId: 1,
      title: 'Hidden Logistics Project',
      intendedOutcome: 'Coordinate a logistics-only outcome.',
      status: 'ACTIVE',
      areaScope: 'AREAS',
      ownerUserId: 10,
      targetEndAt: new Date(future()),
      createdBy: 10,
      updatedBy: 10
    });
    await hiddenProject.addOperationalArea(areaB, { through: { wineryId: 1, relationshipType: 'PRIMARY' } });
    await ProjectItem.create({
      wineryId: 1,
      projectId: hiddenProject.id,
      itemType: 'TASK',
      itemId: task.id,
      isRequired: false,
      isMilestone: false,
      sortOrder: 0,
      addedBy: 10
    });

    await User.update({ role: 'staff' }, { where: { id: 7 } });
    await UserAreaMembership.create({
      wineryId: 1,
      userId: 7,
      areaId: areaA.id,
      membershipRole: 'MEMBER',
      isPrimary: true
    });

    const response = await request(app)
      .get(`/api/projects/for-item?itemType=TASK&itemId=${task.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(response.body.projects).toHaveLength(0);
  });
});
