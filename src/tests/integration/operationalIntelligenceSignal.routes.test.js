process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  Notification,
  OperationalArea,
  OperationalIntelligenceConfigAuditEvent,
  OperationalIntelligenceSignal,
  OperationalRequest,
  Task,
  User,
  Winery,
  WinerySettings
} = require('../../models');
const signalSchedulerService = require('../../services/operationalIntelligenceScheduler.service');

describe('Operational intelligence signal routes', () => {
  const auth = 'Bearer mock-token';
  let area;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.create({ id: 1, name: 'Signal Winery', timeZone: 'Australia/Adelaide' });
    await User.create({
      id: 7,
      firebaseUid: 'stub-uid',
      email: 'stub@example.com',
      displayName: 'Ops Manager',
      role: 'manager',
      wineryId: 1
    });
    await User.create({
      id: 8,
      firebaseUid: 'signal-staff-uid',
      email: 'signal-staff@example.com',
      displayName: 'Signal Staff',
      role: 'staff',
      wineryId: 1
    });
    area = await OperationalArea.create({ wineryId: 1, name: 'Cellar Door', sortOrder: 1 });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('persists advisory signals idempotently and lists review state', async () => {
    const payload = {
      signalType: 'RECURRENCE',
      severity: 'warning',
      title: 'POS freeze recurrence',
      summary: 'Multiple cellar door records mention POS freezes.',
      areaId: area.id,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      dedupeKey: 'recurrence:cellar-door:pos-freeze',
      suggestedAction: 'Review POS stability with cellar door staff.',
      reviewOwnerUserId: 8,
      reviewDueAt: '2026-07-18T00:00:00.000Z',
      evidence: { key: 'pos-froze', examples: [{ type: 'NOTE', id: 1 }] }
    };

    const first = await request(app)
      .post('/api/operations/intelligence/signals')
      .set('Authorization', auth)
      .send(payload)
      .expect(201);
    const repeated = await request(app)
      .post('/api/operations/intelligence/signals')
      .set('Authorization', auth)
      .send(payload)
      .expect(200);

    expect(repeated.body.signal.id).toBe(first.body.signal.id);
    expect(await OperationalIntelligenceSignal.count()).toBe(1);

    const list = await request(app)
      .get('/api/operations/intelligence/signals?status=OPEN')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.signals).toHaveLength(1);
    expect(list.body.signals[0].Area.name).toBe('Cellar Door');
    expect(list.body.signals[0].dedupeKey).toBe('recurrence:cellar-door:pos-freeze');
    expect(list.body.signals[0].suggestedAction).toBe('Review POS stability with cellar door staff.');
    expect(list.body.signals[0].ReviewOwner.id).toBe(8);

    const workflow = await request(app)
      .patch(`/api/operations/intelligence/signals/${first.body.signal.id}/workflow`)
      .set('Authorization', auth)
      .send({
        suggestedAction: 'Assign POS vendor follow-up.',
        reviewDueAt: '2026-07-19T00:00:00.000Z',
        reviewNote: 'Owner confirmed.'
      })
      .expect(200);
    expect(workflow.body.signal.suggestedAction).toBe('Assign POS vendor follow-up.');
    expect(workflow.body.signal.reviewNote).toBe('Owner confirmed.');

    const reviewed = await request(app)
      .patch(`/api/operations/intelligence/signals/${first.body.signal.id}`)
      .set('Authorization', auth)
      .send({ status: 'ACKNOWLEDGED', reviewNote: 'Watch next week.' })
      .expect(200);
    expect(reviewed.body.signal.status).toBe('ACKNOWLEDGED');
    expect(reviewed.body.signal.reviewNote).toBe('Watch next week.');
  });

  it('lets managers read and update operational intelligence controls', async () => {
    const defaults = await request(app)
      .get('/api/operations/intelligence/config')
      .set('Authorization', auth)
      .expect(200);
    expect(defaults.body.config.scheduler.period).toBe('day');
    expect(defaults.body.config.thresholds.trendMinimumDelta).toBe(3);
    expect(defaults.body.presets.map(preset => preset.key)).toEqual(expect.arrayContaining(['default', 'sensitive', 'conservative']));
    expect(defaults.body.fieldMetadata['thresholds.trendMinimumDelta']).toMatch(/trend signal/i);

    const updated = await request(app)
      .patch('/api/operations/intelligence/config')
      .set('Authorization', auth)
      .send({
        scheduler: { enabled: true, period: 'week', offset: 1 },
        thresholds: { trendMinimumDelta: 6, classificationCorrectionRate: 40 },
        reminders: { dueSoonHours: 24, overdueRepeatHours: 12, batchSize: 20 }
      })
      .expect(200);

    expect(updated.body.config.scheduler).toMatchObject({ enabled: true, period: 'week', offset: 1 });
    expect(updated.body.changedKeys).toEqual(expect.arrayContaining(['scheduler.enabled', 'scheduler.period', 'thresholds.trendMinimumDelta']));
    expect(updated.body.config.thresholds.trendMinimumDelta).toBe(6);
    expect(updated.body.config.thresholds.requestAgingAverageAgeHours).toBe(72);
    expect(updated.body.config.reminders).toMatchObject({ dueSoonHours: 24, overdueRepeatHours: 12, batchSize: 20 });

    const settings = await WinerySettings.findOne({ where: { wineryId: 1 } });
    expect(settings.operationalIntelligenceConfig.scheduler.enabled).toBe(true);
    expect(settings.operationalIntelligenceConfig.thresholds.classificationCorrectionRate).toBe(40);
    const audit = await OperationalIntelligenceConfigAuditEvent.findOne({ where: { wineryId: 1 } });
    expect(audit).toBeDefined();
    expect(audit.changedKeys).toEqual(expect.arrayContaining(['scheduler.enabled', 'thresholds.trendMinimumDelta']));

    const preset = await request(app)
      .patch('/api/operations/intelligence/config')
      .set('Authorization', auth)
      .send({ preset: 'sensitive' })
      .expect(200);
    expect(preset.body.config.scheduler.enabled).toBe(true);
    expect(preset.body.config.thresholds.trendMinimumDelta).toBe(2);
    expect(preset.body.auditEvents[0].preset).toBe('sensitive');

    await request(app)
      .patch('/api/operations/intelligence/config')
      .set('Authorization', auth)
      .send({ preset: 'default' })
      .expect(200);

    await OperationalRequest.destroy({ where: { wineryId: 1 } });
    const sixtyHoursAgo = new Date(Date.now() - 60 * 60 * 60 * 1000);
    await OperationalRequest.create({
      wineryId: 1,
      title: 'Aging cellar door request',
      body: 'Customer callback has not been handled yet.',
      status: 'PENDING',
      priority: 'normal',
      sourceType: 'MANUAL',
      areaScope: 'ORGANISATION',
      confirmedBy: 7,
      confirmedAt: sixtyHoursAgo,
      createdBy: 7,
      updatedBy: 7,
      createdAt: sixtyHoursAgo,
      updatedAt: sixtyHoursAgo
    });

    const preview = await request(app)
      .post('/api/operations/intelligence/config/preview')
      .set('Authorization', auth)
      .send({ preset: 'sensitive', period: 'month', offset: 0, historyPeriods: 3 })
      .expect(200);
    expect(preview.body.changedKeys).toEqual(expect.arrayContaining(['scheduler.enabled', 'thresholds.requestAgingAverageAgeHours']));
    expect(preview.body.impact.currentSuggestedCount).toBe(0);
    expect(preview.body.impact.previewSuggestedCount).toBe(1);
    expect(preview.body.impact.addedSignals[0].signalType).toBe('REQUEST_AGING');
    expect(preview.body.history.periodCount).toBe(3);
    expect(preview.body.history.windows).toHaveLength(3);
    expect(preview.body.history.totals.previewSuggestedCount).toBe(3);
    expect(preview.body.changedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'thresholds.requestAgingAverageAgeHours',
        beforeValue: 72,
        afterValue: 48
      })
    ]));

    const customPreview = await request(app)
      .post('/api/operations/intelligence/config/preview')
      .set('Authorization', auth)
      .send({
        thresholds: { requestAgingAverageAgeHours: 48 },
        period: 'month',
        offset: 0,
        historyPeriods: 2
      })
      .expect(200);
    expect(customPreview.body.changedKeys).toEqual(['thresholds.requestAgingAverageAgeHours']);
    expect(customPreview.body.impact.currentSuggestedCount).toBe(0);
    expect(customPreview.body.impact.previewSuggestedCount).toBe(1);
    expect(customPreview.body.history.periodCount).toBe(2);
    expect(customPreview.body.changedFields).toEqual([
      expect.objectContaining({
        path: 'thresholds.requestAgingAverageAgeHours',
        description: expect.stringMatching(/Average pending Request age/)
      })
    ]);
  });

  it('creates a manager-approved task from a signal exactly once', async () => {
    const created = await request(app)
      .post('/api/operations/intelligence/signals')
      .set('Authorization', auth)
      .send({
        signalType: 'REQUEST_AGING',
        severity: 'critical',
        title: 'Overdue request backlog',
        summary: 'Several high-priority requests are overdue.',
        evidence: { pending: 4, overdue: 2 }
      })
      .expect(201);

    const action = await request(app)
      .post(`/api/operations/intelligence/signals/${created.body.signal.id}/create-task`)
      .set('Authorization', auth)
      .send({
        reviewNote: 'Create an action plan.',
        assigneeId: 8,
        dueAt: '2026-07-20T00:00:00.000Z',
        steps: [{
          title: 'Confirm backlog owner',
          description: 'Assign ownership and next check-in.',
          stepType: 'APPROVAL',
          waitingOn: 'MANAGER',
          ownerUserId: 8,
          dueAt: '2026-07-20T00:00:00.000Z'
        }]
      })
      .expect(201);

    expect(action.body.task.category).toBe('OPERATIONS');
    expect(action.body.task.priority).toBe('high');
    expect(action.body.task.assigneeId).toBe(8);
    expect(action.body.signal.status).toBe('ACTION_CREATED');
    expect(action.body.signal.actionTaskId).toBe(action.body.task.id);
    expect(await Task.count()).toBe(1);

    const repeated = await request(app)
      .post(`/api/operations/intelligence/signals/${created.body.signal.id}/create-task`)
      .set('Authorization', auth)
      .send({})
      .expect(200);
    expect(repeated.body.duplicate).toBe(true);
    expect(repeated.body.task.id).toBe(action.body.task.id);
    expect(await Task.count()).toBe(1);
  });

  it('creates de-duplicated review due notifications for assigned signal owners', async () => {
    const dueSoon = await OperationalIntelligenceSignal.create({
      wineryId: 1,
      signalType: 'RECURRENCE',
      status: 'OPEN',
      severity: 'warning',
      title: 'Review cellar door recurrence',
      fingerprint: 'review-reminder-signal',
      dedupeKey: 'review-reminder-signal',
      reviewOwnerUserId: 8,
      reviewDueAt: '2026-07-12T00:00:00.000Z',
      createdBy: 7
    });

    const first = await signalSchedulerService.sendSignalReviewReminders({
      wineryId: 1,
      now: new Date('2026-07-10T12:00:00.000Z'),
      dueSoonHours: 48
    });
    expect(first.scanned).toBeGreaterThanOrEqual(1);
    expect(first.created).toBe(1);

    const ownerNotifications = await Notification.findAll({ where: { userId: 8 } });
    const notification = ownerNotifications.find(item => Number(item.data?.signalId) === Number(dueSoon.id));
    expect(notification).toBeDefined();
    expect(notification.message).toMatch(/approaching its review due date/i);
    expect(notification.data.signalId).toBe(dueSoon.id);
    expect(notification.data.reminderKind).toBe('OPERATIONAL_INTELLIGENCE_REVIEW_DUE_SOON');

    const repeated = await signalSchedulerService.sendSignalReviewReminders({
      wineryId: 1,
      now: new Date('2026-07-10T13:00:00.000Z'),
      dueSoonHours: 48
    });
    expect(repeated.created).toBe(0);
    const repeatedNotifications = await Notification.findAll({ where: { userId: 8 } });
    expect(repeatedNotifications.filter(item => Number(item.data?.signalId) === Number(dueSoon.id))).toHaveLength(1);
  });

  it('materializes thresholded analytics suggestions into the review queue', async () => {
    const oldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    await OperationalRequest.create({
      wineryId: 1,
      title: 'Long-running supplier approval',
      body: 'Awaiting approval beyond the requested date.',
      originalText: 'Awaiting supplier approval.',
      subtype: 'SUPPLIER_APPROVAL',
      status: 'PENDING',
      priority: 'high',
      sourceType: 'MANUAL',
      humanConfirmedType: 'REQUEST',
      confirmedBy: 7,
      confirmedAt: oldDate,
      createdBy: 7,
      updatedBy: 7,
      createdAt: oldDate,
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });

    const before = await OperationalIntelligenceSignal.count({ where: { signalType: 'REQUEST_AGING' } });
    const result = await request(app)
      .post('/api/operations/intelligence/signals/materialize')
      .set('Authorization', auth)
      .send({ start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' })
      .expect(201);

    expect(result.body.suggestedCount).toBeGreaterThanOrEqual(1);
    expect(result.body.signals.map(signal => signal.signalType)).toContain('REQUEST_AGING');
    expect(await OperationalIntelligenceSignal.count({ where: { signalType: 'REQUEST_AGING' } })).toBeGreaterThan(before);

    const repeated = await request(app)
      .post('/api/operations/intelligence/signals/materialize')
      .set('Authorization', auth)
      .send({ start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' })
      .expect(200);
    expect(repeated.body.createdCount).toBe(0);
    expect(repeated.body.suppressedDuplicateCount).toBeGreaterThanOrEqual(0);

    const scheduled = await request(app)
      .post('/api/operations/intelligence/signals/scheduled-run')
      .set('Authorization', auth)
      .send({ start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' })
      .expect(200);
    expect(scheduled.body.wineryCount).toBe(1);
    expect(scheduled.body.suggestedCount).toBeGreaterThanOrEqual(1);
    expect(scheduled.body.results).toHaveLength(1);
    expect(scheduled.body.results[0].wineryId).toBe(1);
  });
});
