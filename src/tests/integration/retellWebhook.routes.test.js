process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.RETELL_API_KEY = '';
process.env.RETELL_WEBHOOK_SECRET = 'mock-retell-secret';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  IntegrationEvent,
  Member,
  Notification,
  OperationalArea,
  OperationalAreaIntegrationConfig,
  Task,
  TaskAction,
  TaskStep,
  User,
  Winery,
  WineryIntegrationConfig
} = require('../../models');

describe('Retell Webhook Integration Event Adapter', () => {
  const originalDeploymentWineryId = process.env.DEPLOYMENT_WINERY_ID;
  const authToken = 'Bearer mock-token';
  let winery;
  let otherWinery;
  let cellarDoorArea;
  let manager;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    winery = await Winery.create({
      id: 1,
      name: 'Retell Adapter Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'retell@example.com'
    });
    otherWinery = await Winery.create({
      id: 2,
      name: 'Other Retell Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'other-retell@example.com'
    });
    cellarDoorArea = await OperationalArea.create({
      wineryId: winery.id,
      name: 'Cellar Door',
      isActive: true
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
    if (originalDeploymentWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
    else process.env.DEPLOYMENT_WINERY_ID = originalDeploymentWineryId;
    await sequelize.close();
  });

  beforeEach(async () => {
    await TaskAction.destroy({ where: {} });
    await TaskStep.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await Task.destroy({ where: {} });
    await IntegrationEvent.destroy({ where: {} });
    await Member.destroy({ where: {} });
    await OperationalAreaIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.create({
      wineryId: winery.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalAccountId: 'retell-account-1',
          externalLocationId: 'agent_123'
        }
      }
    });
    await User.update({ role: 'manager', wineryId: winery.id }, { where: { id: manager.id } });
  });

  function signPayload(payload, timestamp = Date.now()) {
    const digest = crypto
      .createHmac('sha256', 'mock-retell-secret')
      .update(payload)
      .update(String(timestamp))
      .digest('hex');
    return `v=${timestamp},d=${digest}`;
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
      .post('/api/webhooks/retell')
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
      .post('/api/webhooks/retell')
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
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signature)
      .send(body)
      .expect(200);

    expect(duplicateRes.body.duplicate).toBe(true);
    expect(await IntegrationEvent.count()).toBe(1);
  });

  it('ignores client-supplied winery IDs and routes only by the configured Retell agent', async () => {
    const payload = retellCallAnalyzedPayload();
    payload.wineryId = otherWinery.id;
    payload.winery_id = otherWinery.id;
    payload.call.metadata = {
      wineryId: otherWinery.id,
      vinagent_winery_id: otherWinery.id
    };
    payload.call.retell_llm_dynamic_variables.wineryId = otherWinery.id;
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post(`/api/webhooks/retell?wineryId=${otherWinery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(201);

    expect(res.body.event.wineryId).toBe(winery.id);
    const stored = await IntegrationEvent.findByPk(res.body.event.id);
    expect(stored.wineryId).toBe(winery.id);
  });

  it('rejects a signed Retell event whose agent has no persisted winery mapping', async () => {
    const payload = retellCallAnalyzedPayload();
    payload.wineryId = winery.id;
    payload.call.agent_id = 'agent_not_configured';
    payload.call.metadata.wineryId = winery.id;
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(400);

    expect(res.body.error.code).toBe('RETELL_WINERY_MAPPING_REQUIRED');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('does not resolve a Retell mapping outside the configured deployment winery', async () => {
    await WineryIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.create({
      wineryId: otherWinery.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalLocationId: 'agent_123'
        }
      }
    });
    process.env.DEPLOYMENT_WINERY_ID = String(winery.id);
    const body = JSON.stringify(retellCallAnalyzedPayload());

    try {
      const res = await request(app)
        .post('/api/webhooks/retell')
        .set('content-type', 'application/json')
        .set('x-retell-signature', signPayload(body))
        .send(body)
        .expect(400);

      expect(res.body.error.code).toBe('RETELL_WINERY_MAPPING_REQUIRED');
      expect(await IntegrationEvent.count()).toBe(0);
    } finally {
      if (originalDeploymentWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
      else process.env.DEPLOYMENT_WINERY_ID = originalDeploymentWineryId;
    }
  });

  it('rejects an agent mapping shared by more than one winery', async () => {
    await WineryIntegrationConfig.create({
      wineryId: otherWinery.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalLocationId: 'agent_123'
        }
      }
    });
    const body = JSON.stringify(retellCallAnalyzedPayload());

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(400);

    expect(res.body.error.code).toBe('RETELL_WINERY_MAPPING_AMBIGUOUS');
    expect(await IntegrationEvent.count()).toBe(0);
  });

  it('can resolve a unique Retell agent from an area integration config', async () => {
    await WineryIntegrationConfig.destroy({ where: {} });
    await OperationalAreaIntegrationConfig.create({
      wineryId: winery.id,
      areaId: cellarDoorArea.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalLocationId: 'agent_123'
        }
      }
    });
    const body = JSON.stringify(retellCallAnalyzedPayload());

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(201);

    expect(res.body.event.wineryId).toBe(winery.id);
  });

  it('does not trust Retell identifiers stored under an ordinary manager-editable domain', async () => {
    await WineryIntegrationConfig.destroy({ where: {} });
    await OperationalAreaIntegrationConfig.create({
      wineryId: winery.id,
      areaId: cellarDoorArea.id,
      providerConnections: {
        booking: {
          provider: 'retell',
          externalLocationId: 'agent_123'
        }
      }
    });
    const body = JSON.stringify(retellCallAnalyzedPayload());

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(400);

    expect(res.body.error.code).toBe('RETELL_WINERY_MAPPING_REQUIRED');
  });

  it('preserves the operations mapping while rejecting manager attempts to replace it', async () => {
    await request(app)
      .put('/api/winery/integration-config')
      .set('Authorization', authToken)
      .send({
        smsProvider: 'twilio',
        providerConnections: {
          sms: { status: 'not_connected' }
        }
      })
      .expect(200);

    let config = await WineryIntegrationConfig.findOne({ where: { wineryId: winery.id } });
    expect(config.providerConnections.retell).toMatchObject({
      provider: 'retell',
      externalLocationId: 'agent_123'
    });

    await request(app)
      .put('/api/winery/integration-config')
      .set('Authorization', authToken)
      .send({
        providerConnections: {
          retell: {
            provider: 'retell',
            externalLocationId: 'attacker-selected-agent'
          }
        }
      })
      .expect(400);

    config = await WineryIntegrationConfig.findOne({ where: { wineryId: winery.id } });
    expect(config.providerConnections.retell.externalLocationId).toBe('agent_123');
  });

  it('can use a signed provider account ID when Retell includes one', async () => {
    await WineryIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.create({
      wineryId: winery.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalAccountId: 'retell-account-1'
        }
      }
    });
    const payload = retellCallAnalyzedPayload();
    payload.call.agent_id = null;
    payload.call.account_id = 'retell-account-1';
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(201);

    expect(res.body.event.wineryId).toBe(winery.id);
  });

  it('does not treat client-controlled metadata as a Retell account mapping', async () => {
    await WineryIntegrationConfig.destroy({ where: {} });
    await WineryIntegrationConfig.create({
      wineryId: winery.id,
      providerConnections: {
        retell: {
          provider: 'retell',
          externalAccountId: 'metadata-account'
        }
      }
    });
    const payload = retellCallAnalyzedPayload();
    payload.call.agent_id = null;
    payload.call.metadata.account_id = 'metadata-account';
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/api/webhooks/retell')
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(400);

    expect(res.body.error.code).toBe('RETELL_WINERY_MAPPING_REQUIRED');
  });

  it('does not expose the removed winery-scoped Retell webhook route', async () => {
    const body = JSON.stringify(retellCallAnalyzedPayload());

    await request(app)
      .post(`/api/webhooks/retell/${winery.id}`)
      .set('content-type', 'application/json')
      .set('x-retell-signature', signPayload(body))
      .send(body)
      .expect(404);
  });

  it('allows managers to create a task from a reviewed Retell call event', async () => {
    const body = JSON.stringify(retellCallAnalyzedPayload());

    const createRes = await request(app)
      .post('/api/webhooks/retell')
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
