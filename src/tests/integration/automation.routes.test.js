process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  AutomationRule,
  AutomationRuleVersion,
  AutomationRun,
  AutomationRunStep,
  IntegrationEvent,
  IntegrationEventItem,
  Notice,
  NoticeArea,
  Notification,
  Task,
  TaskAction,
  TaskArea,
  TaskStep,
  User,
  Winery
} = require('../../models');

describe('Automation Routes', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let staff;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    winery = await Winery.create({
      id: 1,
      name: 'Automation Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'automation@example.com'
    });
    await User.create({
      id: 7,
      firebaseUid: 'automation-manager',
      email: 'stub@example.com',
      displayName: 'Automation Manager',
      role: 'manager',
      wineryId: winery.id,
      isActive: true
    });
    staff = await User.create({
      id: 8,
      firebaseUid: 'automation-staff',
      email: 'stock@example.com',
      displayName: 'Stock Owner',
      role: 'staff',
      wineryId: winery.id,
      isActive: true
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await AutomationRunStep.destroy({ where: {} });
    await AutomationRun.destroy({ where: {} });
    await AutomationRuleVersion.destroy({ where: {} });
    await AutomationRule.destroy({ where: {} });
    await IntegrationEventItem.destroy({ where: {} });
    await TaskAction.destroy({ where: {} });
    await TaskStep.destroy({ where: {} });
    await TaskArea.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await Task.destroy({ where: {} });
    await NoticeArea.destroy({ where: {} });
    await Notice.destroy({ where: {} });
    await IntegrationEvent.destroy({ where: {} });
  });

  function taskRuleDefinition() {
    return {
      trigger: {
        eventType: 'booking.confirmed'
      },
      conditions: {
        all: [
          {
            path: 'event.normalizedPayload.experienceCode',
            operator: 'EQ',
            value: 'TRUFFLE_PAIRING'
          },
          {
            path: 'event.normalizedPayload.status',
            operator: 'EQ',
            value: 'CONFIRMED'
          }
        ]
      },
      action: {
        type: 'TASK',
        data: {
          category: 'OPERATIONS',
          subType: 'OPERATIONS_SUPPLY_REQUEST',
          priority: 'high',
          assigneeId: staff.id,
          suggestedAction: 'Check truffle stock for booking {{event.normalizedPayload.bookingReference}}.',
          payload: {
            summary: 'Check stock for {{event.normalizedPayload.bookingReference}}',
            bookingReference: '{{event.normalizedPayload.bookingReference}}'
          }
        },
        timing: {
          dueAt: {
            path: 'event.normalizedPayload.startAt',
            offsetMinutes: -2880
          }
        }
      },
      onUnknown: 'SKIP'
    };
  }

  async function createRule(definition = taskRuleDefinition(), name = 'Truffle tasting stock check') {
    return request(app)
      .post('/api/automations/rules')
      .set('Authorization', auth)
      .send({ name, definition })
      .expect(201);
  }

  async function activateRule(ruleId) {
    return request(app)
      .patch(`/api/automations/rules/${ruleId}/status`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
  }

  test('previews, activates, and automatically actions a matching canonical event once', async () => {
    const createRes = await createRule();
    const ruleId = createRes.body.rule.id;
    expect(createRes.body.rule.status).toBe('DRAFT');
    expect(createRes.body.rule.currentVersion).toBe(1);

    const sampleEvent = {
      provider: 'sevenrooms',
      eventType: 'booking.confirmed',
      normalizedPayload: {
        bookingReference: 'SR-1001',
        experienceCode: 'TRUFFLE_PAIRING',
        status: 'CONFIRMED',
        startAt: '2026-08-24T04:00:00.000Z'
      }
    };
    const previewRes = await request(app)
      .post(`/api/automations/rules/${ruleId}/preview`)
      .set('Authorization', auth)
      .send({ sampleEvent, sourceKey: 'preview:sr-1001' })
      .expect(200);
    expect(previewRes.body.preview.state).toBe('MATCHED');
    expect(previewRes.body.preview.proposedAction.data.dueAt).toBe('2026-08-22T04:00:00.000Z');
    expect(await Task.count()).toBe(0);

    await activateRule(ruleId);
    const eventPayload = {
      provider: 'sevenrooms',
      intakeMethod: 'webhook',
      eventType: 'booking.confirmed',
      externalEventId: 'sevenrooms-event-1001',
      normalizedPayload: sampleEvent.normalizedPayload
    };
    const eventRes = await request(app)
      .post('/api/integration-events')
      .set('Authorization', auth)
      .send(eventPayload)
      .expect(201);

    const task = await Task.findOne();
    expect(task).toBeDefined();
    expect(task.assigneeId).toBe(staff.id);
    expect(task.subType).toBe('OPERATIONS_SUPPLY_REQUEST');
    expect(task.dueAt.toISOString()).toBe('2026-08-22T04:00:00.000Z');
    expect(task.payload.automation).toMatchObject({
      generated: true,
      ruleId,
      sourceEventId: eventRes.body.event.id
    });
    expect(task.payload.bookingReference).toBe('SR-1001');

    const run = await AutomationRun.findOne({ where: { ruleId } });
    expect(run.status).toBe('ACTIONED');
    expect(run.actionItemType).toBe('TASK');
    expect(run.actionItemId).toBe(task.id);
    expect(await Notification.count({ where: { userId: staff.id, type: 'ASSIGNMENT' } })).toBe(1);
    expect(await IntegrationEventItem.count({ where: { eventId: eventRes.body.event.id, itemType: 'TASK', itemId: task.id } })).toBe(1);

    await request(app)
      .post('/api/integration-events')
      .set('Authorization', auth)
      .send(eventPayload)
      .expect(200);
    expect(await Task.count()).toBe(1);
    expect(await AutomationRun.count()).toBe(1);
  });

  test('records a non-match without creating operational noise', async () => {
    const createRes = await createRule();
    const ruleId = createRes.body.rule.id;
    await activateRule(ruleId);

    await request(app)
      .post('/api/integration-events')
      .set('Authorization', auth)
      .send({
        provider: 'sevenrooms',
        eventType: 'booking.confirmed',
        externalEventId: 'sevenrooms-event-standard',
        normalizedPayload: {
          bookingReference: 'SR-1002',
          experienceCode: 'STANDARD_TASTING',
          status: 'CONFIRMED',
          startAt: '2026-08-24T04:00:00.000Z'
        }
      })
      .expect(201);

    expect(await Task.count()).toBe(0);
    const run = await AutomationRun.findOne({ where: { ruleId } });
    expect(run.status).toBe('NOT_MATCHED');
  });

  test('creates a targeted notice from a shipment exception rule and exposes run history', async () => {
    const createRes = await createRule({
      trigger: { eventType: 'shipment.exception' },
      conditions: {
        all: [{ path: 'event.normalizedPayload.severity', operator: 'IN', value: ['warning', 'critical'] }]
      },
      action: {
        type: 'NOTICE',
        data: {
          title: 'Shipment {{event.normalizedPayload.trackingNumber}} delayed',
          body: '{{event.normalizedPayload.summary}}',
          category: 'STOCK',
          priority: 'important',
          audienceType: 'users',
          audienceUserIds: [staff.id],
          requiresAcknowledgement: true
        }
      }
    }, 'Shipment exception notice');
    const ruleId = createRes.body.rule.id;
    await activateRule(ruleId);

    await request(app)
      .post('/api/integration-events')
      .set('Authorization', auth)
      .send({
        provider: 'auspost',
        eventType: 'shipment.exception',
        externalEventId: 'auspost-delay-1',
        normalizedPayload: {
          trackingNumber: 'AP-123',
          severity: 'warning',
          summary: 'The truffle delivery is delayed in transit.'
        }
      })
      .expect(201);

    const notice = await Notice.findOne();
    expect(notice.title).toBe('Shipment AP-123 delayed');
    expect(notice.audienceType).toBe('users');
    expect(notice.audienceUserIds).toEqual([staff.id]);
    expect(notice.externalSource).toBe('automation_rule');

    const runsRes = await request(app)
      .get(`/api/automations/runs?ruleId=${ruleId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(runsRes.body.runs).toHaveLength(1);
    expect(runsRes.body.runs[0]).toMatchObject({ status: 'ACTIONED', actionItemType: 'NOTICE', actionItemId: notice.id });

    const capabilitiesRes = await request(app)
      .get('/api/automations/capabilities')
      .set('Authorization', auth)
      .expect(200);
    expect(capabilitiesRes.body.capabilities.map(item => item.name)).toEqual([
      'area.capacity.v1',
      'booking.coverage.v1',
      'booking.readiness.v1',
      'bookings.availability.check',
      'club.fulfilment.v1',
      'customer.relationship.v1',
      'customers.get',
      'shipment.exception.v1'
    ]);
  });

  test('uses a provider-neutral read capability as context before creating a task', async () => {
    const createRes = await createRule({
      trigger: { eventType: 'booking.requested' },
      enrichments: [{
        key: 'availability',
        capability: 'bookings.availability.check',
        input: {
          date: '{{event.normalizedPayload.date}}',
          time: '{{event.normalizedPayload.time}}',
          pax: '{{event.normalizedPayload.guests}}',
          experienceType: '{{event.normalizedPayload.experienceCode}}'
        }
      }],
      conditions: {
        all: [{ path: 'context.availability.available', operator: 'EQ', value: true }]
      },
      action: {
        type: 'TASK',
        data: {
          category: 'BOOKING',
          subType: 'BOOKING_NEW',
          priority: 'normal',
          assigneeId: staff.id,
          taskOrigin: 'INTERNAL',
          payload: {
            summary: 'Review available booking request',
            requestedSlot: '{{event.normalizedPayload.time}}'
          }
        }
      },
      onUnknown: 'FAIL'
    }, 'Available booking request');
    const ruleId = createRes.body.rule.id;
    await activateRule(ruleId);

    await request(app)
      .post('/api/integration-events')
      .set('Authorization', auth)
      .send({
        provider: 'booking-sandbox',
        eventType: 'booking.requested',
        externalEventId: 'booking-request-1',
        normalizedPayload: {
          date: '2026-08-25',
          time: '18:00',
          guests: 4,
          experienceCode: 'TRUFFLE_PAIRING'
        }
      })
      .expect(201);

    const run = await AutomationRun.findOne({ where: { ruleId } });
    expect(run.status).toBe('ACTIONED');
    const step = await AutomationRunStep.findOne({ where: { runId: run.id } });
    expect(step).toMatchObject({
      stepKey: 'availability',
      capability: 'bookings.availability.check',
      status: 'SUCCEEDED'
    });
    expect(step.output).toMatchObject({ available: true });
    expect(await Task.count()).toBe(1);
  });

  test('versions material rule changes and requires manager reactivation', async () => {
    const createRes = await createRule();
    const ruleId = createRes.body.rule.id;
    await activateRule(ruleId);
    const revisedDefinition = taskRuleDefinition();
    revisedDefinition.conditions.all.push({
      path: 'event.normalizedPayload.guests',
      operator: 'GTE',
      value: 6
    });

    const updateRes = await request(app)
      .patch(`/api/automations/rules/${ruleId}`)
      .set('Authorization', auth)
      .send({ definition: revisedDefinition })
      .expect(200);
    expect(updateRes.body.rule).toMatchObject({ status: 'DRAFT', currentVersion: 2 });
    expect(updateRes.body.rule.activatedAt).toBeNull();

    const detailRes = await request(app)
      .get(`/api/automations/rules/${ruleId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detailRes.body.rule.versions.map(version => version.version)).toEqual([2, 1]);
  });
});
