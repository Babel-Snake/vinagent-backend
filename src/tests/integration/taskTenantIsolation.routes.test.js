process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.AI_SKIP = 'true';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  IntegrationEvent,
  Member,
  Message,
  Notification,
  OperationalItemRelation,
  OperationalRecord,
  OperationalRequest,
  Task,
  TaskAction,
  TaskStep,
  User,
  UserTaskFlag,
  Winery,
  WinerySettings
} = require('../../models');

describe('Authenticated task tenant isolation', () => {
  const auth = 'Bearer mock-token';
  let foreignMember;
  let foreignParentTask;
  let foreignUser;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.bulkCreate([
      { id: 1, name: 'Authenticated Winery', timeZone: 'Australia/Adelaide' },
      { id: 2, name: 'Foreign Winery', timeZone: 'Australia/Adelaide' }
    ]);
    await User.bulkCreate([
      {
        id: 7,
        firebaseUid: 'tenant-current-user',
        email: 'stub@example.com',
        displayName: 'Current Manager',
        role: 'manager',
        wineryId: 1
      },
      {
        id: 70,
        firebaseUid: 'tenant-foreign-user',
        email: 'foreign-staff@example.com',
        displayName: 'Foreign Staff',
        role: 'staff',
        wineryId: 2
      }
    ]);
    foreignUser = await User.findByPk(70);
    foreignMember = await Member.create({
      wineryId: 2,
      firstName: 'Private',
      lastName: 'Customer',
      email: 'private.customer@example.com',
      phone: '+61 400 999 999'
    });
    foreignParentTask = await Task.create({
      wineryId: 2,
      category: 'INTERNAL',
      subType: 'FOREIGN_PARENT',
      status: 'PENDING',
      createdBy: foreignUser.id,
      updatedBy: foreignUser.id
    });
    await WinerySettings.create({
      wineryId: 1,
      tier: 'ADVANCED',
      enableWineClubModule: true,
      enableSecureLinks: true,
      enableOrdersModule: true,
      enableBookingModule: true
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  function expectNoForeignPii(response) {
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(foreignMember.firstName);
    expect(serialized).not.toContain(foreignMember.email);
    expect(serialized).not.toContain(foreignMember.phone);
  }

  test('autoclassification rejects a foreign member without returning their PII', async () => {
    const response = await request(app)
      .post('/api/tasks/autoclassify')
      .set('Authorization', auth)
      .send({ text: 'Please review this customer request.', memberId: foreignMember.id })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expectNoForeignPii(response);
  });

  test('task creation rejects every foreign relationship before writes, links, or notifications', async () => {
    const localMessage = await Message.create({
      wineryId: 1,
      source: 'email',
      direction: 'inbound',
      body: 'Local message must remain unlinked.'
    });
    const taskCountBefore = await Task.count();
    const notificationCountBefore = await Notification.count();
    const stepCountBefore = await TaskStep.count();
    const cases = [
      {
        label: 'member',
        data: {
          taskOrigin: 'EXTERNAL',
          inboundMethod: 'email',
          category: 'GENERAL',
          subType: 'GENERAL_ENQUIRY',
          memberId: foreignMember.id,
          messageId: localMessage.id
        }
      },
      {
        label: 'assignee',
        data: {
          taskOrigin: 'INTERNAL',
          inboundMethod: 'internal',
          category: 'INTERNAL',
          subType: 'INTERNAL_TASK',
          assigneeId: foreignUser.id
        }
      },
      {
        label: 'parent task',
        data: {
          taskOrigin: 'INTERNAL',
          inboundMethod: 'internal',
          category: 'INTERNAL',
          subType: 'INTERNAL_TASK',
          parentTaskId: foreignParentTask.id
        }
      },
      {
        label: 'workflow owner',
        data: {
          taskOrigin: 'INTERNAL',
          inboundMethod: 'internal',
          category: 'INTERNAL',
          subType: 'INTERNAL_TASK',
          steps: [{ title: 'Foreign-owned step', ownerUserId: foreignUser.id }]
        }
      }
    ];

    for (const testCase of cases) {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', auth)
        .send(testCase.data)
        .expect(404);
      expect(response.body.error.message).toMatch(/not found/i);
      expectNoForeignPii(response);
    }

    expect(await Task.count()).toBe(taskCountBefore);
    expect(await TaskStep.count()).toBe(stepCountBefore);
    expect(await Notification.count()).toBe(notificationCountBefore);
    expect((await localMessage.reload()).taskId).toBeNull();
  });

  test('task updates reject foreign members, assignees, and parents without partial mutation', async () => {
    const localTask = await Task.create({
      wineryId: 1,
      category: 'INTERNAL',
      subType: 'LOCAL_TASK',
      status: 'PENDING',
      createdBy: 7,
      updatedBy: 7
    });
    const notificationCountBefore = await Notification.count();

    for (const updates of [
      { memberId: foreignMember.id },
      { assigneeId: foreignUser.id },
      { parentTaskId: foreignParentTask.id }
    ]) {
      const response = await request(app)
        .patch(`/api/tasks/${localTask.id}`)
        .set('Authorization', auth)
        .send(updates)
        .expect(404);
      expectNoForeignPii(response);
    }

    await localTask.reload();
    expect(localTask.memberId).toBeNull();
    expect(localTask.assigneeId).toBeNull();
    expect(localTask.parentTaskId).toBeNull();
    expect(await Notification.count()).toBe(notificationCountBefore);
  });

  test('legacy cross-winery links do not expose related PII through task list or detail reads', async () => {
    const localTask = await Task.create({
      wineryId: 1,
      category: 'GENERAL',
      subType: 'LEGACY_CROSS_TENANT_LINK',
      status: 'PENDING',
      memberId: foreignMember.id,
      assigneeId: foreignUser.id,
      parentTaskId: foreignParentTask.id,
      createdBy: foreignUser.id,
      updatedBy: 7
    });
    const foreignMessage = await Message.create({
      wineryId: 2,
      memberId: foreignMember.id,
      taskId: localTask.id,
      source: 'email',
      direction: 'inbound',
      body: 'Foreign private message body.'
    });
    await localTask.update({ messageId: foreignMessage.id });
    await TaskStep.create({
      taskId: localTask.id,
      title: 'Legacy step',
      ownerUserId: foreignUser.id,
      createdBy: 7,
      updatedBy: 7,
      sortOrder: 0
    });
    await TaskAction.create({
      taskId: localTask.id,
      userId: foreignUser.id,
      actionType: 'NOTE_ADDED',
      details: { note: 'No embedded customer details.' }
    });

    const detail = await request(app)
      .get(`/api/tasks/${localTask.id}`)
      .set('Authorization', auth)
      .expect(200);
    const list = await request(app)
      .get('/api/tasks?status=all&search=LEGACY_CROSS_TENANT_LINK')
      .set('Authorization', auth)
      .expect(200);

    expectNoForeignPii(detail);
    expectNoForeignPii(list);
    expect(JSON.stringify(detail.body)).not.toContain('Foreign Staff');
    expect(JSON.stringify(detail.body)).not.toContain('Foreign private message body.');
    expect(detail.body.task.Member).toBeNull();
    expect(detail.body.task.Assignee).toBeNull();
    expect(detail.body.task.ParentTask).toBeNull();
  });

  test('workflow step creation and reassignment reject foreign owners', async () => {
    const localTask = await Task.create({
      wineryId: 1,
      category: 'INTERNAL',
      subType: 'LOCAL_WORKFLOW_TASK',
      status: 'PENDING',
      createdBy: 7,
      updatedBy: 7
    });

    await request(app)
      .post(`/api/tasks/${localTask.id}/steps`)
      .set('Authorization', auth)
      .send({ title: 'Must not be created', ownerUserId: foreignUser.id })
      .expect(404);
    expect(await TaskStep.count({ where: { taskId: localTask.id } })).toBe(0);

    const localStep = await TaskStep.create({
      taskId: localTask.id,
      title: 'Local step',
      ownerUserId: 7,
      createdBy: 7,
      updatedBy: 7,
      sortOrder: 0
    });
    await request(app)
      .patch(`/api/tasks/${localTask.id}/steps/${localStep.id}`)
      .set('Authorization', auth)
      .send({ ownerUserId: foreignUser.id })
      .expect(404);

    expect((await localStep.reload()).ownerUserId).toBe(7);
  });

  test('task flags cannot be created, listed, or deleted through a foreign task ID', async () => {
    await UserTaskFlag.create({ userId: 7, taskId: foreignParentTask.id });

    const list = await request(app)
      .get('/api/tasks/flags')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.taskIds).not.toContain(foreignParentTask.id);

    await request(app)
      .post(`/api/tasks/flags/${foreignParentTask.id}/toggle`)
      .set('Authorization', auth)
      .expect(404);

    expect(await UserTaskFlag.count({
      where: { userId: 7, taskId: foreignParentTask.id }
    })).toBe(1);
  });

  test.each([
    ['Request', '/api/requests', 'request'],
    ['Note', '/api/operational-records', 'note']
  ])('%s conversion cannot assign its generated task to another winery', async (_label, route, type) => {
    let source;
    if (type === 'request') {
      source = await OperationalRequest.create({
        wineryId: 1,
        title: 'Approved local request',
        body: 'Create local follow-up work.',
        status: 'APPROVED',
        priority: 'normal',
        sourceType: 'MANUAL',
        areaScope: 'ORGANISATION',
        humanConfirmedType: 'REQUEST',
        confirmedBy: 7,
        confirmedAt: new Date(),
        createdBy: 7,
        updatedBy: 7
      });
    } else {
      source = await OperationalRecord.create({
        wineryId: 1,
        title: 'Local operational note',
        body: 'Create local follow-up work.',
        sourceType: 'MANUAL',
        occurredAt: new Date(),
        areaScope: 'ORGANISATION',
        humanConfirmedType: 'NOTE',
        confirmedBy: 7,
        confirmedAt: new Date(),
        createdBy: 7,
        updatedBy: 7
      });
    }
    const taskCountBefore = await Task.count();
    const relationCountBefore = await OperationalItemRelation.count();
    const notificationCountBefore = await Notification.count();

    await request(app)
      .post(`${route}/${source.id}/create-task`)
      .set('Authorization', auth)
      .send({ assigneeId: foreignUser.id })
      .expect(404);

    expect(await Task.count()).toBe(taskCountBefore);
    expect(await OperationalItemRelation.count()).toBe(relationCountBefore);
    expect(await Notification.count()).toBe(notificationCountBefore);
  });

  test('integration-event task conversion rejects a foreign workflow owner', async () => {
    const event = await IntegrationEvent.create({
      wineryId: 1,
      provider: 'test-provider',
      intakeMethod: 'manual',
      eventType: 'call.intake',
      status: 'PENDING_REVIEW',
      normalizedPayload: {
        callerName: 'Local Caller',
        callerPhone: '0400 111 222',
        category: 'general_enquiry',
        summary: 'Caller needs a local follow-up.'
      },
      createdBy: 7
    });
    const taskCountBefore = await Task.count();

    await request(app)
      .post(`/api/integration-events/${event.id}/review`)
      .set('Authorization', auth)
      .send({
        action: 'create_task',
        task: {
          steps: [{ title: 'Foreign-owned integration step', ownerUserId: foreignUser.id }]
        }
      })
      .expect(404);

    expect(await Task.count()).toBe(taskCountBefore);
    expect(await Notification.count({ where: { userId: foreignUser.id } })).toBe(0);
  });
});
