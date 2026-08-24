const crypto = require('crypto');
const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  ENTITY_RESOLUTION_STATUSES,
  ROSTER_PUBLISHED_STATES,
  ROSTER_SHIFT_STATUSES,
  STAFF_AVAILABILITY_STATUSES,
  STAFF_AVAILABILITY_TYPES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');

const ROSTER_SHIFT_CONTRACT_VERSION = 'roster-shift-shadow.v1';
const STAFF_AVAILABILITY_CONTRACT_VERSION = 'staff-availability-shadow.v1';
const ROSTER_COVERAGE_CONTRACT_VERSION = 'roster-coverage-shadow.v1';
const FORBIDDEN_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|medical|diagnosis|health|leave[_-]?reason|reason[_-]?text|free[_-]?text|notes?|\bpan\b|iban|\bbsb\b)/i;
const stableKey = max => Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(max);
const normalizedCode = max => Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9_.:-]*$/).max(max);
const nullableText = max => Joi.string().trim().max(max).allow('', null);
const nullableIsoDate = Joi.date().iso().allow(null);

const resolvedMappingSchema = Joi.object({
  resolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  id: Joi.number().integer().positive().allow(null)
}).unknown(false);

const roleMappingSchema = Joi.object({
  code: normalizedCode(120).allow(null),
  resolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  definitionId: Joi.number().integer().positive().allow(null)
}).unknown(false);

const shiftSkillSchema = Joi.object({
  code: normalizedCode(120).required(),
  resolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  definitionId: Joi.number().integer().positive().allow(null)
}).unknown(false);

const rosterShiftSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(ROSTER_SHIFT_CONTRACT_VERSION).required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  staffIdentityId: Joi.number().integer().positive().required(),
  location: resolvedMappingSchema.required(),
  area: resolvedMappingSchema.required(),
  role: roleMappingSchema.required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...ROSTER_SHIFT_STATUSES).required(),
  providerStatus: nullableText(120),
  publishedState: Joi.string().trim().uppercase().valid(...ROSTER_PUBLISHED_STATES).required(),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().required(),
  breakMinutes: Joi.number().integer().min(0).max(1440).default(0),
  sourceTimeZone: nullableText(80),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null),
  skillsComplete: Joi.boolean().valid(true).required(),
  skills: Joi.array().items(shiftSkillSchema).max(100).required()
}).unknown(false);

const staffAvailabilitySnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(STAFF_AVAILABILITY_CONTRACT_VERSION).required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  eventKey: stableKey(180).required(),
  staffIdentityId: Joi.number().integer().positive().required(),
  availabilityType: Joi.string().trim().uppercase().valid(...STAFF_AVAILABILITY_TYPES).required(),
  status: Joi.string().trim().uppercase().valid(...STAFF_AVAILABILITY_STATUSES).required(),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().required(),
  reasonCategory: normalizedCode(80).allow(null),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const rosterCoverageSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(ROSTER_COVERAGE_CONTRACT_VERSION).required(),
  location: resolvedMappingSchema.required(),
  area: resolvedMappingSchema.required(),
  windowStartAt: Joi.date().iso().required(),
  windowEndAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  staleAt: Joi.date().iso().required(),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  isComplete: Joi.boolean().valid(true).required()
}).unknown(false);

function assertPublicObject(value, path) {
  if (value == null) return;
  const inspect = (current, currentPath) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => inspect(item, currentPath + '[' + index + ']'));
      return;
    }
    if (!current || typeof current !== 'object' || current instanceof Date) return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_KEY.test(key)) {
        throw new ValidationError(
          'Workforce snapshot contains a forbidden field at ' + currentPath + '.' + key
        );
      }
      inspect(child, currentPath + '.' + key);
    }
  };
  inspect(value, path);
}

function assertResolutionPair(mapping, label, idField = 'id') {
  if ((mapping.resolutionStatus === 'RESOLVED') !== Boolean(mapping[idField])) {
    throw new ValidationError(
      'Resolved workforce ' + label + ' requires exactly one explicit ID mapping'
    );
  }
}

function validateRosterShiftSnapshot(input) {
  const { value, error } = rosterShiftSnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Roster shift snapshot contract validation failed', error.details);
  assertPublicObject(value.providerExtensions, 'providerExtensions');
  assertResolutionPair(value.location, 'location');
  assertResolutionPair(value.area, 'area');
  assertResolutionPair(value.role, 'role', 'definitionId');
  if (new Date(value.endAt) <= new Date(value.startAt)) {
    throw new ValidationError('Roster shift endAt must be later than startAt');
  }
  const skillCodes = new Set();
  for (const skill of value.skills) {
    assertResolutionPair(skill, 'skill ' + skill.code, 'definitionId');
    if (skillCodes.has(skill.code)) throw new ValidationError('Roster shift skill codes must be unique');
    skillCodes.add(skill.code);
  }
  return value;
}

function validateStaffAvailabilitySnapshot(input) {
  const { value, error } = staffAvailabilitySnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Staff availability snapshot contract validation failed', error.details);
  assertPublicObject(value.providerExtensions, 'providerExtensions');
  if (new Date(value.endAt) <= new Date(value.startAt)) {
    throw new ValidationError('Staff availability endAt must be later than startAt');
  }
  return value;
}

function validateRosterCoverageSnapshot(input) {
  const { value, error } = rosterCoverageSnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Roster coverage snapshot contract validation failed', error.details);
  assertResolutionPair(value.location, 'coverage location');
  assertResolutionPair(value.area, 'coverage area');
  if (new Date(value.windowEndAt) <= new Date(value.windowStartAt)) {
    throw new ValidationError('Roster coverage windowEndAt must be later than windowStartAt');
  }
  if (new Date(value.staleAt) <= new Date(value.observedAt)) {
    throw new ValidationError('Roster coverage staleAt must be later than observedAt');
  }
  return value;
}

const sourceHash = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
const sourceStateHash = snapshot => {
  const sourceState = { ...snapshot };
  delete sourceState.observedAt;
  return sourceHash(sourceState);
};

async function requireWorkforceConnection({ wineryId, connectionId, transaction }) {
  const connection = await models.IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await models.IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'WORKFORCE', isActive: true },
    attributes: ['id'],
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active WORKFORCE scope');
  return connection;
}

async function requireSourceEvent({ wineryId, connectionId, sourceEventId, transaction }) {
  if (!sourceEventId) return;
  const event = await models.IntegrationEvent.findOne({
    where: { id: sourceEventId, wineryId, connectionId },
    attributes: ['id'],
    transaction
  });
  if (!event) throw new ValidationError('Workforce source event does not belong to the connection');
}

async function requireStaffIdentity({ wineryId, staffIdentityId, transaction }) {
  const identity = await models.StaffIdentity.findOne({
    where: { id: staffIdentityId, wineryId, isActive: true },
    attributes: ['id', 'userId', 'employmentStatus'],
    transaction
  });
  if (!identity) throw new ValidationError('Workforce staff identity is not active in this winery');
  return identity;
}

async function requireShiftMappings({ wineryId, snapshot, transaction }) {
  const [location, area, role] = await Promise.all([
    snapshot.location.id
      ? models.WineryLocation.findOne({
        where: { id: snapshot.location.id, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      })
      : null,
    snapshot.area.id
      ? models.OperationalArea.findOne({
        where: { id: snapshot.area.id, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      })
      : null,
    snapshot.role.definitionId
      ? models.RoleSkillDefinition.findOne({
        where: {
          id: snapshot.role.definitionId,
          wineryId,
          definitionKind: 'ROLE',
          isActive: true
        },
        attributes: ['id'],
        transaction
      })
      : null
  ]);
  if (snapshot.location.id && !location) throw new ValidationError('Roster location is not active in this winery');
  if (snapshot.area.id && !area) throw new ValidationError('Roster area is not active in this winery');
  if (snapshot.role.definitionId && !role) {
    throw new ValidationError('Roster role is not an active winery ROLE definition');
  }
  const skillIds = [...new Set(snapshot.skills.map(skill => skill.definitionId).filter(Boolean))];
  if (skillIds.length > 0) {
    const count = await models.RoleSkillDefinition.count({
      where: {
        id: { [Op.in]: skillIds },
        wineryId,
        definitionKind: 'SKILL',
        isActive: true
      },
      transaction
    });
    if (count !== skillIds.length) {
      throw new ValidationError('One or more roster skills are not active winery SKILL definitions');
    }
  }
}

async function recordIssue({
  wineryId,
  connectionId,
  referenceId,
  resourceType,
  externalId,
  issueType,
  title,
  summary,
  evidence,
  sourceVersion,
  severity = 'ERROR',
  transaction
}) {
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId,
    resourceType,
    externalId,
    issueType,
    evidence,
    sourceVersion
  });
  const existing = await models.ProjectionIssue.findOne({ where: { wineryId, fingerprint }, transaction });
  if (existing) {
    await existing.update({
      status: 'OPEN',
      severity,
      lastObservedAt: new Date(),
      observationCount: Number(existing.observationCount || 0) + 1
    }, { transaction });
    return existing;
  }
  return models.ProjectionIssue.create({
    wineryId,
    connectionId,
    externalResourceReferenceId: referenceId,
    issueType,
    fingerprint,
    status: 'OPEN',
    severity,
    title,
    summary,
    evidence,
    sourceVersion,
    observationCount: 1,
    detectedAt: new Date(),
    lastObservedAt: new Date()
  }, { transaction });
}

async function inspectReference({
  wineryId,
  connectionId,
  resourceType,
  snapshot,
  payloadHash,
  transaction
}) {
  let reference = await models.ExternalResourceReference.findOne({
    where: { connectionId, resourceType, externalId: snapshot.externalId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (reference?.providerUpdatedAt) {
    const incoming = new Date(snapshot.sourceUpdatedAt).getTime();
    const current = new Date(reference.providerUpdatedAt).getTime();
    if (incoming < current) return { reference, state: 'STALE' };
    if (incoming === current && reference.sourceHash && reference.sourceHash !== payloadHash) {
      return { reference, state: 'CONFLICT' };
    }
  }
  const values = {
    wineryId,
    connectionId,
    resourceType,
    externalId: snapshot.externalId,
    providerVersion: snapshot.sourceRevision,
    sourceHash: payloadHash,
    providerUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    lastSyncedAt: snapshot.observedAt,
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  reference = reference
    ? await reference.update(values, { transaction })
    : await models.ExternalResourceReference.create({
      ...values,
      resolutionStatus: 'UNRESOLVED'
    }, { transaction });
  return { reference, state: 'CURRENT' };
}

async function resolveReferenceState({
  wineryId,
  connectionId,
  resourceType,
  snapshot,
  referenceResult,
  model,
  transaction
}) {
  const { reference, state } = referenceResult;
  const current = reference.canonicalId
    ? await model.findOne({ where: { id: reference.canonicalId, wineryId }, transaction })
    : null;
  if (state === 'STALE') {
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      resourceType,
      externalId: snapshot.externalId,
      issueType: 'OUT_OF_ORDER',
      title: 'Older ' + resourceType.toLowerCase() + ' update ignored',
      summary: 'The incoming workforce state predates the current source observation.',
      evidence: {
        incomingUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString(),
        currentUpdatedAt: new Date(reference.providerUpdatedAt).toISOString()
      },
      sourceVersion: snapshot.sourceRevision,
      transaction
    });
    return {
      terminal: true,
      result: { status: 'STALE_IGNORED', canonicalId: reference.canonicalId || null }
    };
  }
  if (state === 'CONFLICT') {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    if (current) await current.update({ projectionQuality: 'CONFLICTING' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      resourceType,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: resourceType + ' revision contains conflicting state',
      summary: 'The same provider update time was observed with different workforce content.',
      evidence: { sourceUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString() },
      sourceVersion: snapshot.sourceRevision,
      severity: 'BLOCKING',
      transaction
    });
    return {
      terminal: true,
      result: { status: 'SOURCE_CONFLICT', canonicalId: reference.canonicalId || null }
    };
  }
  return { terminal: false, current };
}

async function syncShiftSkills({ wineryId, shift, snapshot, transaction }) {
  const activeCodes = [];
  for (const skill of snapshot.skills) {
    activeCodes.push(skill.code);
    const values = {
      wineryId,
      rosterShiftId: shift.id,
      definitionId: skill.definitionId || null,
      skillCode: skill.code,
      skillResolutionStatus: skill.resolutionStatus,
      sourceRevision: snapshot.sourceRevision,
      isActive: true,
      removedAt: null
    };
    const [row] = await models.RosterShiftSkill.findOrCreate({
      where: { rosterShiftId: shift.id, skillCode: skill.code },
      defaults: values,
      transaction
    });
    await row.update(values, { transaction });
  }
  await models.RosterShiftSkill.update({ isActive: false, removedAt: new Date(snapshot.observedAt) }, {
    where: {
      wineryId,
      rosterShiftId: shift.id,
      isActive: true,
      ...(activeCodes.length > 0 ? { skillCode: { [Op.notIn]: activeCodes } } : {})
    },
    transaction
  });
}

async function projectRosterShiftInternal({
  wineryId,
  connectionId,
  input,
  sourceEventId = null,
  transaction
}) {
  const snapshot = validateRosterShiftSnapshot(input);
  await requireWorkforceConnection({ wineryId, connectionId, transaction });
  await Promise.all([
    requireStaffIdentity({ wineryId, staffIdentityId: snapshot.staffIdentityId, transaction }),
    requireShiftMappings({ wineryId, snapshot, transaction }),
    requireSourceEvent({ wineryId, connectionId, sourceEventId, transaction })
  ]);
  const payloadHash = sourceStateHash(snapshot);
  const referenceResult = await inspectReference({
    wineryId,
    connectionId,
    resourceType: 'ROSTER_SHIFT',
    snapshot,
    payloadHash,
    transaction
  });
  const inspected = await resolveReferenceState({
    wineryId,
    connectionId,
    resourceType: 'ROSTER_SHIFT',
    snapshot,
    referenceResult,
    model: models.RosterShift,
    transaction
  });
  if (inspected.terminal) {
    return {
      ...inspected.result,
      rosterShiftId: inspected.result.canonicalId,
      automationEligible: false
    };
  }
  const reference = referenceResult.reference;
  const values = {
    wineryId,
    staffIdentityId: snapshot.staffIdentityId,
    locationId: snapshot.location.id || null,
    areaId: snapshot.area.id || null,
    roleDefinitionId: snapshot.role.definitionId || null,
    roleResolutionStatus: snapshot.role.resolutionStatus,
    externalRoleCode: snapshot.role.code || null,
    primarySourceReferenceId: reference.id,
    authorityConnectionId: connectionId,
    canonicalStatus: snapshot.canonicalStatus,
    providerStatus: snapshot.providerStatus || null,
    publishedState: snapshot.publishedState,
    startAt: snapshot.startAt,
    endAt: snapshot.endAt,
    breakMinutes: snapshot.breakMinutes,
    sourceTimeZone: snapshot.sourceTimeZone || null,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    sourceHash: payloadHash,
    projectionQuality: 'SOURCE_ASSERTED',
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  let shift = inspected.current || await models.RosterShift.findOne({
    where: { primarySourceReferenceId: reference.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  shift = shift
    ? await shift.update(values, { transaction })
    : await models.RosterShift.create(values, { transaction });
  await syncShiftSkills({ wineryId, shift, snapshot, transaction });
  await reference.update({
    canonicalType: 'ROSTER_SHIFT',
    canonicalId: shift.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_WORKFORCE_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });
  return {
    status: 'PROJECTED_SHADOW',
    rosterShiftId: shift.id,
    skillsProjected: snapshot.skills.length,
    automationEligible: false
  };
}

async function projectRosterShift(options) {
  if (options.transaction) return projectRosterShiftInternal(options);
  return models.sequelize.transaction(transaction => projectRosterShiftInternal({
    ...options,
    transaction
  }));
}

async function projectStaffAvailabilityInternal({
  wineryId,
  connectionId,
  input,
  sourceEventId = null,
  transaction
}) {
  const snapshot = validateStaffAvailabilitySnapshot(input);
  await requireWorkforceConnection({ wineryId, connectionId, transaction });
  await Promise.all([
    requireStaffIdentity({ wineryId, staffIdentityId: snapshot.staffIdentityId, transaction }),
    requireSourceEvent({ wineryId, connectionId, sourceEventId, transaction })
  ]);
  const payloadHash = sourceStateHash(snapshot);
  const referenceResult = await inspectReference({
    wineryId,
    connectionId,
    resourceType: 'STAFF_AVAILABILITY',
    snapshot,
    payloadHash,
    transaction
  });
  const inspected = await resolveReferenceState({
    wineryId,
    connectionId,
    resourceType: 'STAFF_AVAILABILITY',
    snapshot,
    referenceResult,
    model: models.StaffAvailabilityEvent,
    transaction
  });
  if (inspected.terminal) {
    return {
      ...inspected.result,
      staffAvailabilityEventId: inspected.result.canonicalId,
      automationEligible: false
    };
  }
  const reference = referenceResult.reference;
  const values = {
    wineryId,
    staffIdentityId: snapshot.staffIdentityId,
    primarySourceReferenceId: reference.id,
    authorityConnectionId: connectionId,
    eventKey: snapshot.eventKey,
    availabilityType: snapshot.availabilityType,
    status: snapshot.status,
    startAt: snapshot.startAt,
    endAt: snapshot.endAt,
    reasonCategory: snapshot.reasonCategory || null,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    sourceHash: payloadHash,
    projectionQuality: 'SOURCE_ASSERTED',
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  let availability = inspected.current || await models.StaffAvailabilityEvent.findOne({
    where: { primarySourceReferenceId: reference.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  availability = availability
    ? await availability.update(values, { transaction })
    : await models.StaffAvailabilityEvent.create(values, { transaction });
  await reference.update({
    canonicalType: 'STAFF_AVAILABILITY',
    canonicalId: availability.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_WORKFORCE_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });
  return {
    status: 'PROJECTED_SHADOW',
    staffAvailabilityEventId: availability.id,
    automationEligible: false
  };
}

async function projectStaffAvailability(options) {
  if (options.transaction) return projectStaffAvailabilityInternal(options);
  return models.sequelize.transaction(transaction => projectStaffAvailabilityInternal({
    ...options,
    transaction
  }));
}

function buildCoverageKey(snapshot) {
  return sourceHash({
    locationId: snapshot.location.id || null,
    areaId: snapshot.area.id || null,
    windowStartAt: new Date(snapshot.windowStartAt).toISOString(),
    windowEndAt: new Date(snapshot.windowEndAt).toISOString()
  });
}

async function projectRosterCoverageInternal({
  wineryId,
  connectionId,
  input,
  transaction
}) {
  const snapshot = validateRosterCoverageSnapshot(input);
  await requireWorkforceConnection({ wineryId, connectionId, transaction });
  await requireShiftMappings({
    wineryId,
    snapshot: {
      location: snapshot.location,
      area: snapshot.area,
      role: { resolutionStatus: 'UNRESOLVED', definitionId: null },
      skills: []
    },
    transaction
  });
  const coverageKey = buildCoverageKey(snapshot);
  const payloadHash = sourceHash(snapshot);
  let observation = await models.WorkforceCoverageObservation.findOne({
    where: { wineryId, authorityConnectionId: connectionId, coverageKey },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (observation) {
    const incoming = new Date(snapshot.observedAt).getTime();
    const current = new Date(observation.observedAt).getTime();
    if (incoming < current) {
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: null,
        resourceType: 'ROSTER_COVERAGE',
        externalId: coverageKey,
        issueType: 'OUT_OF_ORDER',
        title: 'Older roster coverage observation ignored',
        summary: 'The incoming completeness evidence predates the current coverage observation.',
        evidence: {
          incomingObservedAt: new Date(snapshot.observedAt).toISOString(),
          currentObservedAt: new Date(observation.observedAt).toISOString()
        },
        sourceVersion: snapshot.sourceRevision,
        transaction
      });
      return {
        status: 'STALE_IGNORED',
        workforceCoverageObservationId: observation.id,
        automationEligible: false
      };
    }
    if (incoming === current && observation.sourceHash !== payloadHash) {
      await observation.update({ projectionQuality: 'CONFLICTING' }, { transaction });
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: null,
        resourceType: 'ROSTER_COVERAGE',
        externalId: coverageKey,
        issueType: 'SOURCE_CONFLICT',
        title: 'Roster coverage observation contains conflicting state',
        summary: 'The same coverage observation time was reused with different completeness evidence.',
        evidence: { observedAt: new Date(snapshot.observedAt).toISOString() },
        sourceVersion: snapshot.sourceRevision,
        severity: 'BLOCKING',
        transaction
      });
      return {
        status: 'SOURCE_CONFLICT',
        workforceCoverageObservationId: observation.id,
        automationEligible: false
      };
    }
  }
  const values = {
    wineryId,
    authorityConnectionId: connectionId,
    locationId: snapshot.location.id || null,
    areaId: snapshot.area.id || null,
    coverageKey,
    windowStartAt: snapshot.windowStartAt,
    windowEndAt: snapshot.windowEndAt,
    observedAt: snapshot.observedAt,
    staleAt: snapshot.staleAt,
    sourceRevision: snapshot.sourceRevision,
    sourceHash: payloadHash,
    isComplete: true,
    projectionQuality: 'SOURCE_ASSERTED'
  };
  observation = observation
    ? await observation.update(values, { transaction })
    : await models.WorkforceCoverageObservation.create(values, { transaction });
  return {
    status: 'PROJECTED_SHADOW',
    workforceCoverageObservationId: observation.id,
    automationEligible: false
  };
}

async function projectRosterCoverage(options) {
  if (options.transaction) return projectRosterCoverageInternal(options);
  return models.sequelize.transaction(transaction => projectRosterCoverageInternal({
    ...options,
    transaction
  }));
}

module.exports = {
  ROSTER_SHIFT_CONTRACT_VERSION,
  STAFF_AVAILABILITY_CONTRACT_VERSION,
  ROSTER_COVERAGE_CONTRACT_VERSION,
  rosterShiftSnapshotSchema,
  staffAvailabilitySnapshotSchema,
  rosterCoverageSnapshotSchema,
  validateRosterShiftSnapshot,
  validateStaffAvailabilitySnapshot,
  validateRosterCoverageSnapshot,
  projectRosterShift,
  projectStaffAvailability,
  projectRosterCoverage
};
