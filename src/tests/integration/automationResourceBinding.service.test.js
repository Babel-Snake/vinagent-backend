process.env.NODE_ENV = 'test';

const db = require('../../models');
const lifecycleRegistry = require('../../services/automationResourceLifecycleRegistry.service');
const bindingService = require('../../services/automationResourceBinding.service');

describe('automation resource binding reconciliation', () => {
  let winery;
  let manager;
  let rule;
  let version;
  let event;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    lifecycleRegistry.clearForTests();
    winery = await db.Winery.create({ name: 'Lifecycle Winery' });
    manager = await db.User.create({
      firebaseUid: 'lifecycle-manager',
      email: 'lifecycle@example.com',
      displayName: 'Lifecycle Manager',
      role: 'manager',
      wineryId: winery.id
    });
    rule = await db.AutomationRule.create({
      wineryId: winery.id,
      name: 'Lifecycle test rule',
      status: 'ACTIVE',
      triggerType: 'booking.confirmed',
      currentVersion: 1,
      createdBy: manager.id,
      updatedBy: manager.id,
      activatedBy: manager.id,
      activatedAt: new Date()
    });
    version = await db.AutomationRuleVersion.create({
      ruleId: rule.id,
      wineryId: winery.id,
      version: 1,
      definition: {},
      definitionHash: 'a'.repeat(64),
      createdBy: manager.id
    });
    event = await db.IntegrationEvent.create({
      wineryId: winery.id,
      provider: 'unit',
      intakeMethod: 'canonical_projection',
      eventType: 'booking.cancelled',
      eventClass: 'CANONICAL',
      status: 'PROCESSED',
      automationEligible: true,
      idempotencyKey: 'cancel-1',
      normalizedPayload: { resource: { type: 'booking', id: 91 } }
    });
  });

  afterAll(async () => db.sequelize.close());

  async function createTaskAndBinding({ humanChange = false } = {}) {
    const task = await db.Task.create({
      wineryId: winery.id,
      category: 'OPERATIONS',
      subType: 'OPERATIONS_SUPPLY_REQUEST',
      customerType: 'UNKNOWN',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      priority: 'high',
      suggestedAction: 'Check stock.',
      payload: { automationPurpose: 'unit.lifecycle.cancel' },
      createdBy: manager.id,
      updatedBy: manager.id,
      assigneeId: manager.id,
      areaScope: 'ORGANISATION'
    });
    const binding = await db.AutomationResourceBinding.create({
      wineryId: winery.id,
      ruleId: rule.id,
      ruleVersionId: version.id,
      resourceType: 'BOOKING',
      resourceId: 91,
      purposeKey: 'unit.lifecycle.cancel',
      itemType: 'TASK',
      itemId: task.id,
      lifecycleState: 'ACTIVE',
      managedFields: ['priority', 'suggestedAction'],
      lastAppliedSnapshot: { priority: 'high', suggestedAction: 'Check stock.' },
      configurationSnapshot: {},
      reconciliationPolicy: {
        onChange: 'UPDATE_MANAGED',
        onCancel: 'CANCEL_IF_UNTOUCHED',
        onUnsafe: 'ANNOTATE'
      }
    });
    if (humanChange) {
      await task.update({ suggestedAction: 'Staff-owned preparation plan.', updatedBy: manager.id });
    }
    return { task, binding };
  }

  function registerCancellationHandler() {
    lifecycleRegistry.register({
      resourceType: 'BOOKING',
      itemType: 'TASK',
      purposeKey: 'unit.lifecycle.cancel',
      managedFields: ['priority', 'suggestedAction'],
      policy: { onChange: 'UPDATE_MANAGED', onCancel: 'CANCEL_IF_UNTOUCHED', onUnsafe: 'ANNOTATE' },
      buildConfiguration: () => ({}),
      resolveDesired: async () => ({
        intent: 'CANCEL',
        reason: 'BOOKING_CANCELLED',
        annotation: 'The linked booking was cancelled; review this staff-owned Task.'
      })
    });
  }

  test('cancels untouched pending work and records system provenance', async () => {
    registerCancellationHandler();
    const { task, binding } = await createTaskAndBinding();
    await db.sequelize.transaction(transaction => bindingService.reconcileOneBinding({
      binding,
      event,
      transaction
    }));

    expect(await task.reload()).toMatchObject({ status: 'REJECTED', workflowState: 'CANCELLED' });
    expect(await binding.reload()).toMatchObject({ lifecycleState: 'CANCELLED', lastDecision: 'CANCELLED' });
    expect(await db.TaskAction.findOne({ where: { taskId: task.id, actionType: 'REJECTED' } }))
      .toMatchObject({ userId: null, details: expect.objectContaining({ source: 'automation_resource_binding' }) });
  });

  test('annotates and releases work when managed content has a human change', async () => {
    registerCancellationHandler();
    const { task, binding } = await createTaskAndBinding({ humanChange: true });
    await db.sequelize.transaction(transaction => bindingService.reconcileOneBinding({
      binding,
      event,
      transaction
    }));

    expect(await task.reload()).toMatchObject({
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      suggestedAction: 'Staff-owned preparation plan.'
    });
    expect(await binding.reload()).toMatchObject({
      lifecycleState: 'HUMAN_OWNED',
      lastDecision: 'ANNOTATED',
      humanOverrideBy: manager.id,
      humanOverrideReason: 'MANAGED_FIELDS_CHANGED'
    });
    expect(await db.TaskAction.findOne({ where: { taskId: task.id, actionType: 'NOTE_ADDED' } }))
      .toMatchObject({ userId: null, details: expect.objectContaining({ source: 'automation_resource_binding' }) });
  });
});
