require('dotenv').config();

const db = require('../models');
const projectService = require('../services/project.service');
const taskCreationService = require('../services/taskCreation.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const SIDEWOOD_NAME = 'Sidewood Estate';

const DEMO_PROJECT_TITLES = [
  'Winter Wine Club Release 2026',
  'Private Member Dinner - August 2026',
  'Cellar Door Weekend Service Lift',
  'Feast Dinner Close-out',
  'FY27 Leadership Priorities',
  'Sidewood Festival Weekend 2026'
];

function daysFromNow(days, hour = 2) {
  const value = new Date(Date.now() + days * DAY_MS);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

function taskTitle(task) {
  return task.payload?.summary || task.nextStepSummary || task.subType || task.category;
}

function requireFromMap(map, key, label) {
  const value = map.get(key);
  if (!value) throw new Error(`Sidewood Project seed requires ${label}: ${key}`);
  return value;
}

async function ensureAreaLinks({ model, foreignKey, recordId, wineryId, primaryAreaId, linkedAreaIds, transaction }) {
  const areaIds = [primaryAreaId, ...linkedAreaIds];
  for (const areaId of areaIds) {
    const relationshipType = Number(areaId) === Number(primaryAreaId) ? 'PRIMARY' : 'LINKED';
    const [link] = await model.findOrCreate({
      where: { [foreignKey]: recordId, areaId },
      defaults: { wineryId, relationshipType },
      transaction
    });
    if (link.relationshipType !== relationshipType) {
      link.relationshipType = relationshipType;
      await link.save({ transaction });
    }
  }
}

async function ensureSupportingRecords({ winery, users, areas, transaction }) {
  const owen = requireFromMap(users, 'Owen', 'user');
  const clare = requireFromMap(users, 'Clare', 'user');
  const wineClub = requireFromMap(areas, 'Wine Club', 'area');
  const logistics = requireFromMap(areas, 'Logistics', 'area');
  const accounts = requireFromMap(areas, 'Accounts', 'area');

  const [approvalRequest] = await db.OperationalRequest.findOrCreate({
    where: {
      wineryId: winery.id,
      title: 'Approve winter release courier uplift'
    },
    defaults: {
      body: 'Approve the temporary courier surcharge and express-freight contingency for the 2026 winter Wine Club release.',
      originalText: 'Logistics needs approval before the release dispatch plan can be locked.',
      subtype: 'BUDGET_APPROVAL',
      status: 'PENDING',
      priority: 'high',
      dueAt: daysFromNow(5),
      sourceType: 'MANUAL',
      areaScope: 'AREAS',
      humanConfirmedType: 'REQUEST',
      wineryId: winery.id,
      requestedFromUserId: owen.id,
      confirmedBy: clare.id,
      confirmedAt: new Date(),
      createdBy: clare.id,
      updatedBy: clare.id
    },
    transaction
  });
  await ensureAreaLinks({
    model: db.OperationalRequestArea,
    foreignKey: 'requestId',
    recordId: approvalRequest.id,
    wineryId: winery.id,
    primaryAreaId: logistics.id,
    linkedAreaIds: [wineClub.id, accounts.id],
    transaction
  });

  const [handoverNote] = await db.OperationalRecord.findOrCreate({
    where: {
      wineryId: winery.id,
      sourceReference: 'sidewood-project-demo-winter-release-2026'
    },
    defaults: {
      title: '2025 winter release handover notes',
      body: 'Last release ran smoothly once failed payments were cleared before labels printed. Keep the courier manifest, member exceptions and campaign send list in one handover.',
      originalText: 'Operational lessons carried forward from the previous winter release.',
      recordType: 'HANDOVER',
      sourceType: 'MANUAL',
      occurredAt: daysFromNow(-14),
      metadata: { demoSeed: 'sidewood-projects-v1' },
      areaScope: 'AREAS',
      humanConfirmedType: 'NOTE',
      wineryId: winery.id,
      confirmedBy: clare.id,
      confirmedAt: new Date(),
      createdBy: clare.id,
      updatedBy: clare.id
    },
    transaction
  });
  await ensureAreaLinks({
    model: db.OperationalRecordArea,
    foreignKey: 'recordId',
    recordId: handoverNote.id,
    wineryId: winery.id,
    primaryAreaId: wineClub.id,
    linkedAreaIds: [logistics.id],
    transaction
  });

  const eventInputs = [
    {
      title: 'Winter Wine Club Release Dispatch - 2026',
      description: 'Dispatch milestone for the coordinated winter Wine Club release.',
      start: daysFromNow(25),
      end: daysFromNow(26),
      allDay: true
    },
    {
      title: 'Private Member Dinner - August 2026',
      description: 'Member dinner service milestone covering guest, menu, floor and communications readiness.',
      start: daysFromNow(14, 9),
      end: daysFromNow(14, 13),
      allDay: false
    },
    {
      title: 'Weekend Service Readiness Check',
      description: 'Final Cellar Door roster and tasting-service readiness check.',
      start: daysFromNow(7, 1),
      end: daysFromNow(7, 2),
      allDay: false
    },
    {
      title: 'Sidewood Festival Weekend - 2026',
      description: 'Cross-department Festival delivery milestone led by Restaurant with Cellar Door and Marketing collaboration.',
      start: daysFromNow(42, 1),
      end: daysFromNow(43, 8),
      allDay: true
    }
  ];
  const events = new Map();
  for (const input of eventInputs) {
    const [event] = await db.CalendarEvent.findOrCreate({
      where: { wineryId: winery.id, title: input.title },
      defaults: {
        ...input,
        type: 'event',
        wineryId: winery.id,
        createdBy: owen.id
      },
      transaction
    });
    events.set(input.title, event);
  }

  return { approvalRequest, handoverNote, events };
}

async function ensureFestivalTasks({ winery, users, areas, tasks, transaction }) {
  const actor = requireFromMap(users, 'Owen', 'user');
  const inputs = [
    {
      title: 'Confirm Festival restaurant service plan',
      body: 'Confirm the Festival menu, service stations, floor plan and Restaurant staffing handoff.',
      assignee: requireFromMap(users, 'Kirri', 'user'),
      area: requireFromMap(areas, 'Restaurant', 'area'),
      dueAt: daysFromNow(18),
      priority: 'high'
    },
    {
      title: 'Prepare Festival Cellar Door tasting roster',
      body: 'Prepare the tasting roster, guest flow and stock handoff for the Festival weekend.',
      assignee: requireFromMap(users, 'Jacob', 'user'),
      area: requireFromMap(areas, 'Cellar Door', 'area'),
      dueAt: daysFromNow(24),
      priority: 'normal'
    },
    {
      title: 'Launch Festival marketing campaign',
      body: 'Coordinate campaign assets, publishing dates and final operational sign-off for the Festival.',
      assignee: requireFromMap(users, 'Lara', 'user'),
      area: requireFromMap(areas, 'Marketing', 'area'),
      dueAt: daysFromNow(14),
      priority: 'high'
    }
  ];

  for (const input of inputs) {
    let task = tasks.get(input.title);
    if (!task) {
      task = await taskCreationService.createTask({
        wineryId: winery.id,
        userId: actor.id,
        userRole: actor.role,
        source: 'project_demo_seed',
        transaction,
        data: {
          category: 'INTERNAL',
          subType: 'PROJECT_ACTION',
          priority: input.priority,
          sentiment: 'NEUTRAL',
          taskOrigin: 'INTERNAL',
          inboundMethod: 'internal',
          payload: {
            summary: input.title,
            originalText: input.body,
            demoSeed: 'sidewood-project-lead-v1'
          },
          notes: input.body,
          dueAt: input.dueAt,
          assigneeId: input.assignee.id,
          areaScope: 'AREAS',
          primaryAreaId: input.area.id,
          linkedAreaIds: []
        }
      });
      tasks.set(input.title, task);
    }
  }
}

async function logSeedAudit({ project, actor, eventType, transaction, beforeSnapshot = null, afterSnapshot = null, metadata = null }) {
  await db.ProjectAuditEvent.create({
    wineryId: project.wineryId,
    projectId: project.id,
    actorUserId: actor.id,
    eventType,
    beforeSnapshot,
    afterSnapshot,
    metadata
  }, { transaction });
}

async function ensureParticipant({ project, actor, participant, transaction }) {
  const existing = await db.ProjectParticipant.findOne({
    where: { projectId: project.id, userId: participant.user.id },
    transaction
  });
  const data = {
    participationRole: participant.role,
    notificationsEnabled: participant.notificationsEnabled
  };
  if (!existing) {
    await db.ProjectParticipant.create({
      wineryId: project.wineryId,
      projectId: project.id,
      userId: participant.user.id,
      addedBy: actor.id,
      ...data
    }, { transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: 'PARTICIPANT_ADDED',
      metadata: { userId: participant.user.id, participationRole: participant.role },
      transaction
    });
    if (participant.notificationsEnabled && Number(participant.user.id) !== Number(actor.id)) {
      await db.Notification.create({
        userId: participant.user.id,
        type: 'SYSTEM',
        message: `You were added to Project: ${project.title}`,
        data: { wineryId: project.wineryId, projectId: project.id, href: `/projects?projectId=${project.id}` }
      }, { transaction });
    }
    return;
  }
  if (
    existing.participationRole !== data.participationRole
    || Boolean(existing.notificationsEnabled) !== Boolean(data.notificationsEnabled)
  ) {
    const beforeSnapshot = existing.toJSON();
    await existing.update(data, { transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: 'PARTICIPANT_UPDATED',
      beforeSnapshot,
      afterSnapshot: existing.toJSON(),
      metadata: { userId: participant.user.id },
      transaction
    });
  }
}

async function ensureProjectItem({ project, actor, item, transaction }) {
  const existing = await db.ProjectItem.findOne({
    where: { projectId: project.id, itemType: item.itemType, itemId: item.itemId },
    transaction
  });
  const data = {
    linkType: item.linkType || 'REFERENCE',
    isRequired: Boolean(item.isRequired),
    isMilestone: Boolean(item.isMilestone),
    sortOrder: item.sortOrder || 0
  };
  if (!existing) {
    const link = await db.ProjectItem.create({
      wineryId: project.wineryId,
      projectId: project.id,
      itemType: item.itemType,
      itemId: item.itemId,
      addedBy: actor.id,
      ...data
    }, { transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: data.linkType === 'DELEGATED_WORK' ? 'TASK_DELEGATED' : 'ITEM_LINKED',
      metadata: {
        projectItemId: link.id,
        itemType: link.itemType,
        itemId: link.itemId,
        taskId: data.linkType === 'DELEGATED_WORK' ? link.itemId : undefined,
        areaId: item.areaId || undefined,
        assigneeId: item.assigneeId || undefined,
        isRequired: link.isRequired,
        isMilestone: link.isMilestone
      },
      transaction
    });
    return;
  }
  if (
    Boolean(existing.isRequired) !== data.isRequired
    || Boolean(existing.isMilestone) !== data.isMilestone
    || existing.linkType !== data.linkType
    || Number(existing.sortOrder) !== Number(data.sortOrder)
  ) {
    const beforeSnapshot = existing.toJSON();
    await existing.update(data, { transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: 'ITEM_UPDATED',
      beforeSnapshot,
      afterSnapshot: existing.toJSON(),
      metadata: { projectItemId: existing.id, itemType: existing.itemType, itemId: existing.itemId },
      transaction
    });
  }
}

async function ensureDependency({ project, actor, dependency, transaction }) {
  const existing = await db.ProjectTaskDependency.findOne({
    where: {
      projectId: project.id,
      blockingTaskId: dependency.blockingTaskId,
      blockedTaskId: dependency.blockedTaskId
    },
    transaction
  });
  if (existing) return;
  const created = await db.ProjectTaskDependency.create({
    wineryId: project.wineryId,
    projectId: project.id,
    blockingTaskId: dependency.blockingTaskId,
    blockedTaskId: dependency.blockedTaskId,
    createdBy: actor.id
  }, { transaction });
  await logSeedAudit({
    project,
    actor,
    eventType: 'DEPENDENCY_ADDED',
    metadata: { dependencyId: created.id, ...dependency },
    transaction
  });
}

async function ensureProject({ winery, actor, spec, transaction }) {
  let project = await db.Project.findOne({
    where: { wineryId: winery.id, title: spec.title },
    transaction
  });
  let created = false;
  if (!project) {
    project = await db.Project.create({
      wineryId: winery.id,
      title: spec.title,
      intendedOutcome: spec.intendedOutcome,
      businessContext: spec.businessContext,
      status: spec.initialStatus,
      areaScope: spec.areaScope,
      ownerUserId: spec.ownerUserId || null,
      leadUserId: spec.leadUserId || null,
      leadGrantedByUserId: spec.leadUserId ? actor.id : null,
      leadGrantedAt: spec.leadUserId ? new Date() : null,
      plannedStartAt: spec.plannedStartAt || null,
      targetEndAt: spec.targetEndAt || null,
      riskReason: spec.riskReason || null,
      riskReviewAt: spec.riskReviewAt || null,
      createdBy: actor.id,
      updatedBy: actor.id
    }, { transaction });
    created = true;
  }

  if (spec.areaScope === 'AREAS') {
    await ensureAreaLinks({
      model: db.ProjectArea,
      foreignKey: 'projectId',
      recordId: project.id,
      wineryId: winery.id,
      primaryAreaId: spec.primaryAreaId,
      linkedAreaIds: spec.linkedAreaIds,
      transaction
    });
  }
  if (created) {
    await logSeedAudit({
      project,
      actor,
      eventType: 'CREATED',
      afterSnapshot: {
        ...project.toJSON(),
        areaIds: spec.areaScope === 'AREAS' ? [spec.primaryAreaId, ...spec.linkedAreaIds] : []
      },
      transaction
    });
    if (project.ownerUserId && Number(project.ownerUserId) !== Number(actor.id)) {
      await db.Notification.create({
        userId: project.ownerUserId,
        type: 'SYSTEM',
        message: `You were assigned as owner of Project: ${project.title}`,
        data: { wineryId: project.wineryId, projectId: project.id, href: `/projects?projectId=${project.id}` }
      }, { transaction });
    }
    if (project.leadUserId) {
      await logSeedAudit({
        project,
        actor,
        eventType: 'LEAD_ASSIGNED',
        afterSnapshot: { leadUserId: project.leadUserId, ownerUserId: project.ownerUserId },
        metadata: { leadUserId: project.leadUserId, reportsToUserId: project.ownerUserId },
        transaction
      });
      if (Number(project.leadUserId) !== Number(actor.id)) {
        await db.Notification.create({
          userId: project.leadUserId,
          type: 'SYSTEM',
          message: `You were appointed Project Lead for ${project.title}.`,
          data: { wineryId: project.wineryId, projectId: project.id, href: `/projects?projectId=${project.id}` }
        }, { transaction });
      }
    }
  } else if (Number(project.leadUserId || 0) !== Number(spec.leadUserId || 0)) {
    const beforeSnapshot = project.toJSON();
    const previousLeadUserId = project.leadUserId;
    project.leadUserId = spec.leadUserId || null;
    project.leadGrantedByUserId = spec.leadUserId ? actor.id : null;
    project.leadGrantedAt = spec.leadUserId ? new Date() : null;
    project.updatedBy = actor.id;
    await project.save({ transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: spec.leadUserId ? (previousLeadUserId ? 'LEAD_CHANGED' : 'LEAD_ASSIGNED') : 'LEAD_REVOKED',
      beforeSnapshot,
      afterSnapshot: project.toJSON(),
      metadata: {
        previousLeadUserId: previousLeadUserId || null,
        leadUserId: spec.leadUserId || null,
        reportsToUserId: project.ownerUserId
      },
      transaction
    });
    if (project.leadUserId && Number(project.leadUserId) !== Number(actor.id)) {
      await db.Notification.create({
        userId: project.leadUserId,
        type: 'SYSTEM',
        message: `You were appointed Project Lead for ${project.title}.`,
        data: { wineryId: project.wineryId, projectId: project.id, href: `/projects?projectId=${project.id}` }
      }, { transaction });
    }
  }
  for (const participant of spec.participants) {
    await ensureParticipant({ project, actor, participant, transaction });
  }
  for (const item of spec.items) {
    await ensureProjectItem({ project, actor, item, transaction });
  }
  for (const dependency of spec.dependencies || []) {
    await ensureDependency({ project, actor, dependency, transaction });
  }
  if (spec.finalStatus === 'COMPLETED' && project.status !== 'COMPLETED') {
    const beforeSnapshot = project.toJSON();
    project.status = 'COMPLETED';
    project.actualCompletedAt = new Date();
    project.completionReason = null;
    project.updatedBy = actor.id;
    await project.save({ transaction });
    await logSeedAudit({
      project,
      actor,
      eventType: 'STATUS_CHANGED',
      beforeSnapshot,
      afterSnapshot: project.toJSON(),
      transaction
    });
    await logSeedAudit({ project, actor, eventType: 'COMPLETED', afterSnapshot: project.toJSON(), transaction });
  }
  return { created, projectId: project.id };
}

function projectSpecs({ users, areas, tasks, notices, events, supporting }) {
  const user = name => requireFromMap(users, name, 'user');
  const area = name => requireFromMap(areas, name, 'area');
  const task = title => requireFromMap(tasks, title, 'Task');
  const notice = title => requireFromMap(notices, title, 'Notice');
  const event = title => requireFromMap(events, title, 'Calendar Event');
  const participant = (name, role = 'PARTICIPANT', notificationsEnabled = true) => ({
    user: user(name),
    role,
    notificationsEnabled
  });

  return [
    {
      title: DEMO_PROJECT_TITLES[0],
      intendedOutcome: 'Pack and dispatch the winter allocation on schedule, with failed payments resolved, member communications approved and every cross-area handoff visible.',
      businessContext: 'This release coordinates Wine Club, Logistics, Marketing and Accounts. The linked approval, handover note and dispatch event show how Projects can hold work and context without replacing their source records.',
      initialStatus: 'ACTIVE',
      finalStatus: 'ACTIVE',
      areaScope: 'AREAS',
      primaryAreaId: area('Wine Club').id,
      linkedAreaIds: [area('Logistics').id, area('Marketing').id, area('Accounts').id],
      ownerUserId: user('Owen').id,
      leadUserId: user('Clare').id,
      plannedStartAt: daysFromNow(-10),
      targetEndAt: daysFromNow(32),
      riskReason: 'Courier pricing needs approval before the final dispatch plan is locked.',
      riskReviewAt: daysFromNow(5),
      participants: [
        participant('Clare'),
        participant('Bradley'),
        participant('Lara'),
        participant('Lisa', 'STAKEHOLDER', false)
      ],
      items: [
        { itemType: 'TASK', itemId: task('Review failed winter allocation payments').id, isRequired: true, sortOrder: 10 },
        { itemType: 'TASK', itemId: task('Schedule winter release campaign').id, isRequired: true, sortOrder: 20 },
        { itemType: 'TASK', itemId: task('Prepare wine club release dispatch').id, isRequired: true, isMilestone: true, sortOrder: 30 },
        { itemType: 'REQUEST', itemId: supporting.approvalRequest.id, sortOrder: 40 },
        { itemType: 'NOTICE', itemId: notice('Winter release coordination').id, sortOrder: 50 },
        { itemType: 'NOTE', itemId: supporting.handoverNote.id, sortOrder: 60 },
        { itemType: 'CALENDAR_EVENT', itemId: event('Winter Wine Club Release Dispatch - 2026').id, isMilestone: true, sortOrder: 70 }
      ],
      dependencies: [
        { blockingTaskId: task('Review failed winter allocation payments').id, blockedTaskId: task('Prepare wine club release dispatch').id },
        { blockingTaskId: task('Schedule winter release campaign').id, blockedTaskId: task('Prepare wine club release dispatch').id }
      ]
    },
    {
      title: DEMO_PROJECT_TITLES[1],
      intendedOutcome: 'Deliver a polished private member dinner with the guest list, floor plan, menu, service briefing and member communications ready before service.',
      businessContext: 'A cross-area hospitality example showing a Project as the shared outcome above Restaurant, Cellar Door, Wine Club, Marketing and Accounts records.',
      initialStatus: 'ACTIVE',
      finalStatus: 'ACTIVE',
      areaScope: 'AREAS',
      primaryAreaId: area('Restaurant').id,
      linkedAreaIds: [area('Cellar Door').id, area('Wine Club').id, area('Marketing').id, area('Accounts').id],
      ownerUserId: user('Owen').id,
      leadUserId: user('Kirri').id,
      plannedStartAt: daysFromNow(-3),
      targetEndAt: daysFromNow(18),
      riskReason: 'Final guest numbers and dietary requirements are still being confirmed.',
      riskReviewAt: daysFromNow(4),
      participants: [
        participant('Kirri'),
        participant('Jacob'),
        participant('Clare', 'STAKEHOLDER'),
        participant('Lara', 'STAKEHOLDER', false)
      ],
      items: [
        { itemType: 'TASK', itemId: task('Coordinate private member dinner').id, isRequired: true, sortOrder: 10 },
        { itemType: 'TASK', itemId: task('Confirm Saturday restaurant floor plan').id, sortOrder: 20 },
        { itemType: 'NOTICE', itemId: notice('Private member dinner run sheet').id, sortOrder: 30 },
        { itemType: 'CALENDAR_EVENT', itemId: event('Private Member Dinner - August 2026').id, isMilestone: true, sortOrder: 40 }
      ],
      dependencies: []
    },
    {
      title: DEMO_PROJECT_TITLES[2],
      intendedOutcome: 'Run a consistent, well-staffed weekend tasting service with the roster confirmed and the team briefed before doors open.',
      businessContext: 'A focused single-area example owned by Serena as the Cellar Door area manager rather than the winery-level manager.',
      initialStatus: 'ACTIVE',
      finalStatus: 'ACTIVE',
      areaScope: 'AREAS',
      primaryAreaId: area('Cellar Door').id,
      linkedAreaIds: [],
      ownerUserId: user('Serena').id,
      leadUserId: user('Jacob').id,
      plannedStartAt: daysFromNow(-2),
      targetEndAt: daysFromNow(14),
      participants: [
        participant('Jacob'),
        participant('Nick'),
        participant('Kirri', 'STAKEHOLDER', false)
      ],
      items: [
        { itemType: 'TASK', itemId: task('Prepare weekend tasting roster').id, isRequired: true, sortOrder: 10 },
        { itemType: 'NOTICE', itemId: notice('Weekend tasting service briefing').id, sortOrder: 20 },
        { itemType: 'CALENDAR_EVENT', itemId: event('Weekend Service Readiness Check').id, isMilestone: true, sortOrder: 30 }
      ],
      dependencies: []
    },
    {
      title: DEMO_PROJECT_TITLES[3],
      intendedOutcome: 'Close the Feast Dinner preparation loop with its completed pickup action and event evidence retained as an accessible record.',
      businessContext: 'A completed example demonstrating 100% required-Task progress, a closed lifecycle and retained Project history.',
      initialStatus: 'ACTIVE',
      finalStatus: 'COMPLETED',
      areaScope: 'AREAS',
      primaryAreaId: area('Restaurant').id,
      linkedAreaIds: [area('Cellar Door').id],
      ownerUserId: user('Owen').id,
      plannedStartAt: new Date('2026-05-10T02:00:00.000Z'),
      targetEndAt: new Date('2026-05-22T02:00:00.000Z'),
      participants: [
        participant('Kirri'),
        participant('Jacob', 'STAKEHOLDER', false)
      ],
      items: [
        { itemType: 'TASK', itemId: task('Assign Jacob for Food Order Pickup').id, isRequired: true, isMilestone: true, sortOrder: 10 },
        { itemType: 'CALENDAR_EVENT', itemId: event('Feast Dinner').id, isMilestone: true, sortOrder: 20 }
      ],
      dependencies: []
    },
    {
      title: DEMO_PROJECT_TITLES[4],
      intendedOutcome: 'Agree the FY27 operating priorities and success measures before detailed work is commissioned across the winery.',
      businessContext: 'An organisation-wide planning example with optional linked context and no required work yet, so progress is intentionally not calculated.',
      initialStatus: 'PLANNED',
      finalStatus: 'PLANNED',
      areaScope: 'ORGANISATION',
      primaryAreaId: null,
      linkedAreaIds: [],
      ownerUserId: user('Owen').id,
      leadUserId: user('Lisa').id,
      plannedStartAt: daysFromNow(20),
      targetEndAt: daysFromNow(75),
      participants: [participant('Lisa', 'STAKEHOLDER')],
      items: [
        { itemType: 'TASK', itemId: task('Review monthly leadership dashboard').id, sortOrder: 10 },
        { itemType: 'NOTICE', itemId: notice('Sidewood weekly operational priorities').id, sortOrder: 20 }
      ],
      dependencies: []
    },
    {
      title: DEMO_PROJECT_TITLES[5],
      intendedOutcome: 'Deliver a cohesive Festival weekend across Restaurant service, Cellar Door tastings and Marketing, with Kirri leading the shared plan and each department owning its assigned work.',
      businessContext: 'Owen remains accountable while Kirri is the scoped Project Lead. Kirri can coordinate the whole outcome and delegate Project Tasks into collaborating departments without becoming their organisational manager.',
      initialStatus: 'ACTIVE',
      finalStatus: 'ACTIVE',
      areaScope: 'AREAS',
      primaryAreaId: area('Restaurant').id,
      linkedAreaIds: [area('Cellar Door').id, area('Marketing').id],
      ownerUserId: user('Owen').id,
      leadUserId: user('Kirri').id,
      plannedStartAt: daysFromNow(-1),
      targetEndAt: daysFromNow(43),
      riskReason: 'Guest-flow, wet-weather capacity and campaign timing require coordinated weekly review.',
      riskReviewAt: daysFromNow(6),
      participants: [
        participant('Serena', 'STAKEHOLDER'),
        participant('Jacob'),
        participant('Lara'),
        participant('Clare', 'STAKEHOLDER', false)
      ],
      items: [
        { itemType: 'TASK', itemId: task('Confirm Festival restaurant service plan').id, linkType: 'DELEGATED_WORK', areaId: area('Restaurant').id, assigneeId: user('Kirri').id, isRequired: true, isMilestone: true, sortOrder: 10 },
        { itemType: 'TASK', itemId: task('Prepare Festival Cellar Door tasting roster').id, linkType: 'DELEGATED_WORK', areaId: area('Cellar Door').id, assigneeId: user('Jacob').id, isRequired: true, sortOrder: 20 },
        { itemType: 'TASK', itemId: task('Launch Festival marketing campaign').id, linkType: 'DELEGATED_WORK', areaId: area('Marketing').id, assigneeId: user('Lara').id, isRequired: true, sortOrder: 30 },
        { itemType: 'NOTICE', itemId: notice('Gallery Restaurant menu briefing').id, sortOrder: 40 },
        { itemType: 'NOTICE', itemId: notice('Weekend tasting service briefing').id, sortOrder: 50 },
        { itemType: 'NOTICE', itemId: notice('Campaign asset approval').id, sortOrder: 60 },
        { itemType: 'CALENDAR_EVENT', itemId: event('Sidewood Festival Weekend - 2026').id, isMilestone: true, sortOrder: 70 }
      ],
      dependencies: []
    }
  ];
}

async function seedSidewoodProjects() {
  const transaction = await db.sequelize.transaction();
  let winery;
  let actor;
  const results = [];
  try {
    winery = await db.Winery.findOne({ where: { name: SIDEWOOD_NAME }, transaction });
    if (!winery) throw new Error('Run npm run seed:sidewood before seeding Sidewood Projects.');

    const [userRows, areaRows, taskRows, noticeRows, eventRows] = await Promise.all([
      db.User.findAll({ where: { wineryId: winery.id, isActive: true }, transaction }),
      db.OperationalArea.findAll({ where: { wineryId: winery.id, isActive: true }, transaction }),
      db.Task.findAll({ where: { wineryId: winery.id }, transaction }),
      db.Notice.findAll({ where: { wineryId: winery.id }, transaction }),
      db.CalendarEvent.findAll({ where: { wineryId: winery.id }, transaction })
    ]);
    const users = new Map(userRows.map(value => [value.displayName, value]));
    const areas = new Map(areaRows.map(value => [value.name, value]));
    const tasks = new Map(taskRows.map(value => [taskTitle(value), value]));
    const notices = new Map(noticeRows.map(value => [value.title, value]));
    const existingEvents = new Map(eventRows.map(value => [value.title, value]));
    actor = requireFromMap(users, 'Owen', 'user');
    const supporting = await ensureSupportingRecords({ winery, users, areas, transaction });
    await ensureFestivalTasks({ winery, users, areas, tasks, transaction });
    const events = new Map([...existingEvents, ...supporting.events]);
    const specs = projectSpecs({ users, areas, tasks, notices, events, supporting });

    for (const spec of specs) {
      results.push(await ensureProject({ winery, actor, spec, transaction }));
    }
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }

  const details = [];
  for (const result of results) {
    details.push(await projectService.getProjectById({
      projectId: result.projectId,
      wineryId: winery.id,
      userId: actor.id,
      userRole: actor.role
    }));
  }
  return {
    winery: { id: winery.id, name: winery.name },
    projects: details.map((detail, index) => ({
      id: detail.id,
      title: detail.title,
      created: results[index].created,
      status: detail.status,
      health: detail.summary.health,
      progressPercent: detail.summary.progressPercent,
      owner: detail.Owner?.displayName || detail.Owner?.email || null,
      lead: detail.Lead?.displayName || detail.Lead?.email || null,
      areaScope: detail.areaScope,
      areas: detail.areas.map(value => value.name),
      participants: (detail.Participants || []).length,
      linkedItems: detail.items.length,
      dependencies: detail.dependencies.length,
      restrictedItems: detail.restrictedItemCount
    }))
  };
}

if (require.main === module) {
  seedSidewoodProjects()
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('Failed to seed Sidewood Project demonstrations:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.sequelize.close();
    });
}

module.exports = {
  DEMO_PROJECT_TITLES,
  seedSidewoodProjects
};
