process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.RETELL_WEBHOOK_SECRET = 'mock-retell-secret';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  IntegrationEvent,
  Member,
  Notification,
  Task,
  TaskAction,
  TaskStep,
  User,
  Winery
} = require('../../models');

describe('Retell Webhook Integration Event Adapter', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let manager;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    winery = await Winery.create({
      id: 1,
      name: 'Retell Adapter Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'retell@example.com'
    });

    manager = await User.create({
      id: 7,
      firebaseUid: 'retell-manager-uid',
      email: 'stub@example.com',
      displayName: 'Retell Manager',
      role: 'manager',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await TaskAction.destroy({ where: {} });
    await TaskStep.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await Task.destroy({ where: {} });
    await IntegrationEvent.destroy({ where: {} });
    await Member.destroy({ where: {} });
    await User.update({ role: 'manager', wineryId: winery.id }, { where: { id: manager.id } });
  });

  function signPayload(payload) {
    return crypto
      .createHmac('sha256', 'mock-retell-secret')
      .update(payload)
      .digest('hex');
  }

  function retellCallAnalyzedPayload() {
    return {
      event: 'call_analyzed',
      call: {
        call_id: 'retell-call-1',
        agent_id: 'agent_123',
        call_status: 'ended',
        call_type: 'phone_call',
        direction: 'inbound',
        from_number: '+61400111222',
        to_number: '+61881234567',
        start_timestamp: 1781158200000,
        end_timestamp: 1781158385000,
        transcript: 'Caller: I would like to book a tasting for six this Saturday.',
        recording_url: 'https://retell.example/recording/retell-call-1',
        metadata: {
          locationId: 'cellar-door'
        },
        retell_llm_dynamic_variables: {
          customer_name: 'Sarah Booker'
        },
        call_analysis: {
          call_summary: 'Sarah wants to book a tasting for six people this Saturday.',
          custom_analysis_data: {
            intent: 'booking enquiry',
            urgency: 'normal',
            recommended_action: 'Call Sarah back to confirm availability.'
          }
        }
      }
    };
  }

  it('acknowledges transient Retell events without creating review queue noise', async () => {
    const body = JSON.stringify({
      event: 'call_started',
      call: {
        call_id: 'retell-started-1',
        from_number: '+61400111222'
      }
    });

    const res = await request(app)
      .post(`/api/webhooks/retell/${winery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      received: true,
      skipped: true,
      reason: 'non_actionable_event'
    });
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('creates a reviewable call intake event from Retell call analysis and deduplicates retries', async () => {
    const body = JSON.stringify(retellCallAnalyzedPayload());
    const signature = signPayload(body);

    const createRes = await request(app)
      .post(`/api/webhooks/retell/${winery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signature)
      .send(body)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    expect(createRes.body.duplicate).toBe(false);
    expect(createRes.body.event).toMatchObject({
      provider: 'retell',
      intakeMethod: 'webhook',
      eventType: 'call.intake',
      externalEventId: 'retell-call-1:call_analyzed',
      status: 'PENDING_REVIEW'
    });
    expect(createRes.body.event.normalizedPayload).toMatchObject({
      provider: 'retell',
      callerName: 'Sarah Booker',
      callerPhone: '+61400111222',
      durationSeconds: 185,
      summary: 'Sarah wants to book a tasting for six people this Saturday.',
      category: 'booking_enquiry',
      urgency: 'normal',
      recommendedAction: 'Call Sarah back to confirm availability.',
      externalCallId: 'retell-call-1'
    });
    expect(createRes.body.event.metadata).toMatchObject({
      provider: 'retell',
      retellEvent: 'call_analyzed',
      externalCallId: 'retell-call-1',
      actionable: true
    });

    const listRes = await request(app)
      .get('/api/integration-events?status=PENDING_REVIEW&provider=retell')
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.events).toHaveLength(1);
    expect(listRes.body.events[0].id).toBe(createRes.body.event.id);

    const duplicateRes = await request(app)
      .post(`/api/webhooks/retell/${winery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signature)
      .send(body)
      .expect(200);

    expect(duplicateRes.body.duplicate).toBe(true);
    expect(await IntegrationEvent.count()).toBe(1);
  });

  it('allows managers to create a task from a reviewed Retell call event', async () => {
    const body = JSON.stringify(retellCallAnalyzedPayload());

    const createRes = await request(app)
      .post(`/api/webhooks/retell/${winery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(201);

    const reviewRes = await request(app)
      .post(`/api/integration-events/${createRes.body.event.id}/review`)
      .set('Authorization', authToken)
      .send({ action: 'create_task' })
      .expect(200);

    expect(reviewRes.body.event.status).toBe('PROCESSED');
    expect(reviewRes.body.event.relatedRecordType).toBe('TASK');
    expect(reviewRes.body.task).toMatchObject({
      category: 'BOOKING',
      subType: 'BOOKING_NEW',
      suggestedChannel: 'voice'
    });
    expect(reviewRes.body.task.payload.manualIntake).toMatchObject({
      requesterName: 'Sarah Booker',
      requesterPhone: '+61400111222'
    });
    expect(reviewRes.body.task.payload.callIntake).toMatchObject({
      provider: 'retell',
      externalCallId: 'retell-call-1',
      durationSeconds: 185,
      sourceEventId: createRes.body.event.id
    });

    const steps = await TaskStep.findAll({ where: { taskId: reviewRes.body.task.id } });
    expect(steps).toHaveLength(2);
  });
});
