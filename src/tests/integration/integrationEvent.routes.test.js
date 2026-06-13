process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  IntegrationEvent,
  Member,
  Notification,
  Notice,
  NoticeTask,
  Task,
  TaskAction,
  TaskStep,
  User,
  Winery
} = require('../../models');

describe('Integration Event Routes', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let manager;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    winery = await Winery.create({
      id: 1,
      name: 'Integration Event Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'integrations@example.com'
    });

    manager = await User.create({
      id: 7,
      firebaseUid: 'integration-manager-uid',
      email: 'stub@example.com',
      displayName: 'Integration Manager',
      role: 'manager',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await NoticeTask.destroy({ where: {} });
    await TaskAction.destroy({ where: {} });
    await TaskStep.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await Task.destroy({ where: {} });
    await Notice.destroy({ where: {} });
    await IntegrationEvent.destroy({ where: {} });
    await Member.destroy({ where: {} });
    await User.update({ role: 'manager', wineryId: winery.id }, { where: { id: manager.id } });
  });

  it('creates a normalized integration event and treats repeated external IDs as duplicates', async () => {
    const payload = {
      provider: 'deputy',
      intakeMethod: 'manual',
      eventType: 'notice.imported',
      externalEventId: 'deputy-notice-1',
      rawPayload: {
        id: 'deputy-notice-1',
        title: 'Saturday roster changed',
        message: 'Cellar door roster changed for Saturday. Please check your shift.',
        posted_by: 'Cellar Door Manager',
        created_at: '2026-06-10T23:30:00.000Z'
      }
    };

    const createRes = await request(app)
      .post('/api/integration-events')
      .set('Authorization', authToken)
      .send(payload)
      .expect(201);

    expect(createRes.body.duplicate).toBe(false);
    expect(createRes.body.event.status).toBe('PENDING_REVIEW');
    expect(createRes.body.event.normalizedPayload).toMatchObject({
      title: 'Saturday roster changed',
      category: 'STAFF',
      externalAuthorName: 'Cellar Door Manager'
    });

    const duplicateRes = await request(app)
      .post('/api/integration-events')
      .set('Authorization', authToken)
      .send(payload)
      .expect(200);

    expect(duplicateRes.body.duplicate).toBe(true);
    expect(await IntegrationEvent.count()).toBe(1);

    const listRes = await request(app)
      .get('/api/integration-events?status=PENDING_REVIEW')
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.events).toHaveLength(1);
    expect(listRes.body.events[0].provider).toBe('deputy');
  });

  it('publishes an imported notice and links it to existing tasks', async () => {
    const task = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'BRIEF_STAFF',
      status: 'PENDING',
      priority: 'normal'
    });

    const createRes = await request(app)
      .post('/api/integration-events')
      .set('Authorization', authToken)
      .send({
        provider: 'deputy',
        intakeMethod: 'manual',
        eventType: 'notice.imported',
        externalEventId: 'deputy-notice-2',
        rawPayload: {
          id: 'deputy-notice-2',
          title: 'New tasting procedure',
          body: 'Use the revised tasting procedure from Friday.',
          category: 'staff',
          priority: 'important',
          user: { name: 'Ops Manager' },
          created_at: '2026-06-09T01:00:00.000Z'
        }
      })
      .expect(201);

    const reviewRes = await request(app)
      .post(`/api/integration-events/${createRes.body.event.id}/review`)
      .set('Authorization', authToken)
      .send({
        action: 'publish_notice',
        taskIds: [task.id],
        notice: {
          isPinned: true
        }
      })
      .expect(200);

    expect(reviewRes.body.event.status).toBe('PROCESSED');
    expect(reviewRes.body.event.relatedRecordType).toBe('NOTICE');
    expect(reviewRes.body.notice.title).toBe('New tasting procedure');
    expect(reviewRes.body.notice.externalSource).toBe('deputy');
    expect(reviewRes.body.notice.externalId).toBe('deputy-notice-2');
    expect(reviewRes.body.notice.externalAuthorName).toBe('Ops Manager');
    expect(reviewRes.body.notice.isPinned).toBe(true);

    const notice = await Notice.findByPk(reviewRes.body.notice.id);
    expect(notice.sourceEventId).toBe(createRes.body.event.id);

    const link = await NoticeTask.findOne({
      where: {
        noticeId: notice.id,
        taskId: task.id
      }
    });
    expect(link).toBeDefined();
  });

  it('creates a draft task from a generic call intake event', async () => {
    const createRes = await request(app)
      .post('/api/integration-events')
      .set('Authorization', authToken)
      .send({
        provider: 'voice-agent',
        intakeMethod: 'webhook',
        eventType: 'call.intake',
        externalEventId: 'call-123',
        rawPayload: {
          callerName: 'Sarah Booker',
          callerPhone: '+61400111222',
          callTime: '2026-06-11T02:00:00.000Z',
          durationSeconds: 185,
          summary: 'Sarah wants to book a tasting for six people this Saturday.',
          transcript: 'Hi, I would like to book a tasting for six people this Saturday.',
          recordingUrl: 'https://example.com/recording/call-123',
          intent: 'booking enquiry',
          urgency: 'normal',
          recommendedAction: 'Call Sarah back to confirm availability.'
        }
      })
      .expect(201);

    const reviewRes = await request(app)
      .post(`/api/integration-events/${createRes.body.event.id}/review`)
      .set('Authorization', authToken)
      .send({ action: 'create_task' })
      .expect(200);

    expect(reviewRes.body.event.status).toBe('PROCESSED');
    expect(reviewRes.body.event.relatedRecordType).toBe('TASK');
    expect(reviewRes.body.task.category).toBe('BOOKING');
    expect(reviewRes.body.task.subType).toBe('BOOKING_NEW');
    expect(reviewRes.body.task.suggestedChannel).toBe('voice');
    expect(reviewRes.body.task.payload.callIntake).toMatchObject({
      sourceEventId: createRes.body.event.id,
      externalCallId: 'call-123',
      durationSeconds: 185,
      recordingUrl: 'https://example.com/recording/call-123'
    });
    expect(reviewRes.body.task.payload.manualIntake).toMatchObject({
      taskOrigin: 'EXTERNAL',
      inboundMethod: 'phone',
      requesterName: 'Sarah Booker',
      requesterPhone: '+61400111222'
    });

    const steps = await TaskStep.findAll({ where: { taskId: reviewRes.body.task.id } });
    expect(steps).toHaveLength(2);
  });

  it('restricts integration event review APIs to managers and admins', async () => {
    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    await request(app)
      .get('/api/integration-events')
      .set('Authorization', authToken)
      .expect(403);
  });
});
