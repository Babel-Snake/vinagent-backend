const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');
const workforceManagement = require('./workforceManagement.service');

const BOOKING_COVERAGE_CONTEXT_PACK = 'booking.coverage.v1';
const BOOKING_COVERAGE_GAP_PURPOSE = 'booking.workforce_coverage_gap';
const ACTIVE_SHIFT_STATUSES = Object.freeze(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']);
const BLOCKING_AVAILABILITY_TYPES = Object.freeze(['UNAVAILABLE', 'LEAVE', 'SICK_LEAVE']);
const BLOCKING_AVAILABILITY_STATUSES = Object.freeze(['APPROVED', 'SOURCE_ASSERTED']);

const inputSchema = Joi.object({
  bookingId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600)
}).unknown(false);

const nullableId = Joi.number().integer().positive().allow(null);
const nullableIso = Joi.string().isoDate().allow(null);
const outputSchema = Joi.object({
  schemaVersion: Joi.string().valid(BOOKING_COVERAGE_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  booking: Joi.object({
    id: Joi.number().integer().positive().required(),
    referenceCode: Joi.string().max(255).required(),
    status: Joi.string().max(40).required(),
    startAt: Joi.string().isoDate().required(),
    endAt: Joi.string().isoDate().required(),
    locationId: nullableId,
    primaryAreaId: nullableId,
    experienceCode: Joi.string().max(160).allow(null)
  }).unknown(false).required(),
  status: Joi.string().valid('COVERED', 'GAP', 'UNKNOWN', 'STALE').required(),
  code: Joi.string().max(120).required(),
  calculationReliable: Joi.boolean().required(),
  automationEligible: Joi.boolean().valid(false).required(),
  demandCount: Joi.number().integer().min(0).required(),
  gapCount: Joi.number().integer().min(0).required(),
  checks: Joi.array().items(Joi.object({
    mappingId: Joi.number().integer().positive().required(),
    definitionId: Joi.number().integer().positive().required(),
    definitionKind: Joi.string().valid('ROLE', 'SKILL').required(),
    definitionCode: Joi.string().max(120).required(),
    definitionName: Joi.string().max(160).required(),
    areaId: nullableId,
    locationId: nullableId,
    windowStartAt: Joi.string().isoDate().required(),
    windowEndAt: Joi.string().isoDate().required(),
    requiredCount: Joi.number().integer().min(1).required(),
    rosteredCount: Joi.number().integer().min(0).required(),
    status: Joi.string().valid('COVERED', 'GAP', 'UNKNOWN', 'STALE').required(),
    coverageObservationId: nullableId,
    observedAt: nullableIso,
    staleAt: nullableIso,
    rosteredStaff: Joi.array().items(Joi.object({
      staffIdentityId: Joi.number().integer().positive().required(),
      userId: nullableId,
      displayName: Joi.string().max(160).required()
    }).unknown(false)).max(100).required()
  }).unknown(false)).max(100).required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(100).required(),
    hasCoverageGapTask: Joi.boolean().required(),
    hasCoverageGapBinding: Joi.boolean().required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('FRESH', 'STALE', 'UNKNOWN').required(),
    oldestObservedAt: nullableIso,
    earliestStaleAt: nullableIso,
    maxAgeSeconds: Joi.number().integer().min(60).max(604800).required()
  }).unknown(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(30).required()
}).unknown(false);

const iso = value => value ? new Date(value).toISOString() : null;

async function loadOpenCoverageWork({ wineryId, bookingId, transaction }) {
  const [links, binding] = await Promise.all([
    models.OperationalResourceLink.findAll({
      where: {
        wineryId,
        resourceType: 'BOOKING',
        resourceId: bookingId,
        itemType: 'TASK',
        linkType: 'GENERATED_FOR'
      },
      attributes: ['itemId', 'metadata'],
      transaction
    }),
    models.AutomationResourceBinding.findOne({
      where: {
        wineryId,
        resourceType: 'BOOKING',
        resourceId: bookingId,
        purposeKey: BOOKING_COVERAGE_GAP_PURPOSE
      },
      attributes: ['id'],
      transaction
    })
  ]);
  const taskIds = [...new Set(links.map(link => Number(link.itemId)).filter(Number.isSafeInteger))];
  const tasks = taskIds.length === 0 ? [] : await models.Task.findAll({
    where: { id: { [Op.in]: taskIds }, wineryId, status: 'PENDING' },
    attributes: ['id', 'payload'],
    transaction
  });
  const gapLinkIds = new Set(links
    .filter(link => link.metadata?.purposeKey === BOOKING_COVERAGE_GAP_PURPOSE)
    .map(link => Number(link.itemId)));
  return {
    taskCount: tasks.length,
    taskIds: tasks.map(task => task.id),
    hasCoverageGapTask: tasks.some(task => (
      gapLinkIds.has(task.id)
      || task.payload?.automationPurpose === BOOKING_COVERAGE_GAP_PURPOSE
    )),
    hasCoverageGapBinding: Boolean(binding)
  };
}

function sourceRecordsForBooking(booking) {
  const experience = (booking.Items || []).find(item => item.itemType === 'EXPERIENCE');
  const experienceCode = experience?.externalCode
    ? workforceManagement.normalizeCode(experience.externalCode, 'booking experience code')
    : (booking.primaryBookingTypeId ? 'booking-type:' + booking.primaryBookingTypeId : null);
  const records = [];
  if (experienceCode) {
    records.push({
      sourceRecordType: 'BOOKING_TYPE',
      sourceCodeNormalized: experienceCode,
      quantity: 1
    });
  }
  const requirementQuantities = new Map();
  for (const requirement of (booking.Requirements || [])) {
    if (requirement.sensitivityClass === 'RESTRICTED') continue;
    const code = workforceManagement.normalizeCode(requirement.code, 'booking requirement code');
    requirementQuantities.set(code, (requirementQuantities.get(code) || 0) + Number(requirement.quantity || 0));
  }
  for (const [sourceCodeNormalized, quantity] of requirementQuantities) {
    records.push({ sourceRecordType: 'BOOKING_REQUIREMENT', sourceCodeNormalized, quantity });
  }
  return { records, experienceCode };
}

function selectMappings(mappings, connectionId) {
  const selected = new Map();
  for (const mapping of mappings) {
    const key = [
      mapping.sourceRecordType,
      mapping.sourceCodeNormalized,
      mapping.definitionId,
      mapping.areaId || 'booking-area',
      mapping.locationId || 'booking-location'
    ].join(':');
    const existing = selected.get(key);
    if (!existing || mapping.sourceConnectionId === connectionId) selected.set(key, mapping);
  }
  return [...selected.values()];
}

async function loadBookingAndMappings({ wineryId, bookingId, transaction }) {
  const booking = await models.Booking.findOne({
    where: { id: bookingId, wineryId },
    include: [
      { association: 'Items', where: { isActive: true }, required: false },
      { association: 'Requirements', where: { isActive: true }, required: false },
      {
        association: 'AreaLinks',
        where: { relationshipType: 'PRIMARY' },
        required: false
      }
    ],
    transaction
  });
  if (!booking) throw new NotFoundError('Canonical booking was not found for workforce coverage');
  const source = sourceRecordsForBooking(booking);
  const pairs = source.records.map(record => ({
    sourceRecordType: record.sourceRecordType,
    sourceCodeNormalized: record.sourceCodeNormalized
  }));
  const mappings = pairs.length === 0 ? [] : await models.WorkforceDemandMapping.findAll({
    where: {
      wineryId,
      status: 'ACTIVE',
      [Op.and]: [
        { [Op.or]: pairs },
        {
          [Op.or]: [
            { sourceConnectionId: null },
            { sourceConnectionId: booking.authorityConnectionId }
          ]
        }
      ]
    },
    include: [{
      association: 'Definition',
      where: { isActive: true },
      required: true,
      attributes: ['id', 'definitionKind', 'code', 'name']
    }],
    order: [['sourceConnectionId', 'ASC'], ['id', 'ASC']],
    transaction
  });
  return {
    booking,
    experienceCode: source.experienceCode,
    records: source.records,
    mappings: selectMappings(mappings, booking.authorityConnectionId)
  };
}

function demandForMapping({ booking, records, mapping }) {
  const record = records.find(candidate => (
    candidate.sourceRecordType === mapping.sourceRecordType
    && candidate.sourceCodeNormalized === mapping.sourceCodeNormalized
  ));
  const bookingEnd = booking.endAt ? new Date(booking.endAt) : new Date(booking.startAt);
  return {
    mapping,
    areaId: mapping.areaId || booking.AreaLinks?.[0]?.areaId || null,
    locationId: mapping.locationId || booking.locationId || null,
    windowStartAt: new Date(new Date(booking.startAt).getTime() - (mapping.bufferBeforeMinutes * 60000)),
    windowEndAt: new Date(bookingEnd.getTime() + (mapping.bufferAfterMinutes * 60000)),
    requiredCount: Math.max(1, Math.ceil(Number(record?.quantity || 1) * Number(mapping.headcountMultiplier)))
  };
}

function observationSpecificity(observation, demand) {
  let score = 0;
  if (demand.locationId && observation.locationId === demand.locationId) score += 2;
  if (demand.areaId && observation.areaId === demand.areaId) score += 1;
  return score;
}

async function findCoverageObservation({ wineryId, demand, maxAgeSeconds, now, transaction }) {
  const scopeClauses = [];
  if (demand.locationId) scopeClauses.push({ locationId: demand.locationId });
  scopeClauses.push({ locationId: null });
  const areaClauses = [];
  if (demand.areaId) areaClauses.push({ areaId: demand.areaId });
  areaClauses.push({ areaId: null });
  const observations = await models.WorkforceCoverageObservation.findAll({
    where: {
      wineryId,
      isComplete: true,
      windowStartAt: { [Op.lte]: demand.windowStartAt },
      windowEndAt: { [Op.gte]: demand.windowEndAt },
      [Op.and]: [
        { [Op.or]: scopeClauses },
        { [Op.or]: areaClauses }
      ]
    },
    order: [['observedAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
  const eligible = observations.filter(observation => (
    observation.projectionQuality !== 'CONFLICTING'
    && (!observation.locationId || observation.locationId === demand.locationId)
    && (!observation.areaId || observation.areaId === demand.areaId)
  )).sort((left, right) => (
    observationSpecificity(right, demand) - observationSpecificity(left, demand)
    || new Date(right.observedAt) - new Date(left.observedAt)
  ));
  const observation = eligible[0] || null;
  if (!observation) return { status: 'UNKNOWN', observation: null };
  const future = new Date(observation.observedAt).getTime() > now.getTime() + (5 * 60 * 1000);
  const ageSeconds = Math.max(0, Math.floor((now - new Date(observation.observedAt)) / 1000));
  const stale = future
    || new Date(observation.staleAt) <= now
    || ageSeconds > maxAgeSeconds;
  return { status: stale ? 'STALE' : 'FRESH', observation };
}

function hasRequiredDefinition(shift, definition, at) {
  if (definition.definitionKind === 'ROLE') return shift.roleDefinitionId === definition.id;
  const sourceSkill = (shift.Skills || []).some(skill => (
    skill.isActive
    && skill.skillResolutionStatus === 'RESOLVED'
    && skill.definitionId === definition.id
  ));
  if (sourceSkill) return true;
  return (shift.StaffIdentity?.RoleSkills || []).some(assignment => (
    assignment.definitionId === definition.id
    && assignment.status === 'ACTIVE'
    && (!assignment.validFrom || new Date(assignment.validFrom) <= at)
    && (!assignment.validTo || new Date(assignment.validTo) >= at)
  ));
}

async function findRosteredStaff({ wineryId, demand, observation, transaction }) {
  const shiftWhere = {
    wineryId,
    authorityConnectionId: observation.authorityConnectionId,
    canonicalStatus: { [Op.in]: ACTIVE_SHIFT_STATUSES },
    publishedState: 'PUBLISHED',
    projectionQuality: { [Op.ne]: 'CONFLICTING' },
    deletedAtSource: null,
    startAt: { [Op.lte]: demand.windowStartAt },
    endAt: { [Op.gte]: demand.windowEndAt }
  };
  if (demand.locationId) shiftWhere.locationId = demand.locationId;
  if (demand.areaId) shiftWhere.areaId = demand.areaId;
  const shifts = await models.RosterShift.findAll({
    where: shiftWhere,
    include: [
      {
        association: 'StaffIdentity',
        where: { isActive: true, employmentStatus: 'ACTIVE' },
        required: true,
        attributes: ['id', 'userId', 'displayName'],
        include: [{
          association: 'RoleSkills',
          where: { status: 'ACTIVE' },
          required: false,
          attributes: ['definitionId', 'status', 'validFrom', 'validTo']
        }]
      },
      {
        association: 'Skills',
        where: { isActive: true },
        required: false,
        attributes: ['definitionId', 'skillResolutionStatus', 'isActive']
      }
    ],
    order: [['staffIdentityId', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const qualifying = shifts.filter(shift => (
    hasRequiredDefinition(shift, demand.mapping.Definition, new Date(demand.windowStartAt))
  ));
  const staffIds = [...new Set(qualifying.map(shift => shift.staffIdentityId))];
  if (staffIds.length === 0) return [];
  const blocking = await models.StaffAvailabilityEvent.findAll({
    where: {
      wineryId,
      authorityConnectionId: observation.authorityConnectionId,
      staffIdentityId: { [Op.in]: staffIds },
      availabilityType: { [Op.in]: BLOCKING_AVAILABILITY_TYPES },
      status: { [Op.in]: BLOCKING_AVAILABILITY_STATUSES },
      projectionQuality: { [Op.ne]: 'CONFLICTING' },
      deletedAtSource: null,
      startAt: { [Op.lt]: demand.windowEndAt },
      endAt: { [Op.gt]: demand.windowStartAt }
    },
    attributes: ['staffIdentityId'],
    transaction
  });
  const unavailable = new Set(blocking.map(item => item.staffIdentityId));
  const staff = new Map();
  for (const shift of qualifying) {
    if (unavailable.has(shift.staffIdentityId) || staff.has(shift.staffIdentityId)) continue;
    staff.set(shift.staffIdentityId, {
      staffIdentityId: shift.StaffIdentity.id,
      userId: shift.StaffIdentity.userId || null,
      displayName: shift.StaffIdentity.displayName
    });
  }
  return [...staff.values()].slice(0, 100);
}

async function evaluateDemand({
  wineryId,
  demand,
  maxAgeSeconds,
  now,
  transaction
}) {
  const evidence = await findCoverageObservation({
    wineryId,
    demand,
    maxAgeSeconds,
    now,
    transaction
  });
  const base = {
    mappingId: demand.mapping.id,
    definitionId: demand.mapping.Definition.id,
    definitionKind: demand.mapping.Definition.definitionKind,
    definitionCode: demand.mapping.Definition.code,
    definitionName: demand.mapping.Definition.name,
    areaId: demand.areaId,
    locationId: demand.locationId,
    windowStartAt: iso(demand.windowStartAt),
    windowEndAt: iso(demand.windowEndAt),
    requiredCount: demand.requiredCount,
    coverageObservationId: evidence.observation?.id || null,
    observedAt: iso(evidence.observation?.observedAt),
    staleAt: iso(evidence.observation?.staleAt)
  };
  if (evidence.status !== 'FRESH') {
    return {
      ...base,
      rosteredCount: 0,
      status: evidence.status,
      rosteredStaff: []
    };
  }
  const rosteredStaff = await findRosteredStaff({
    wineryId,
    demand,
    observation: evidence.observation,
    transaction
  });
  return {
    ...base,
    rosteredCount: rosteredStaff.length,
    status: rosteredStaff.length >= demand.requiredCount ? 'COVERED' : 'GAP',
    rosteredStaff
  };
}

function summarizeChecks(checks) {
  if (checks.length === 0) {
    return {
      status: 'UNKNOWN',
      code: 'WORKFORCE_DEMAND_UNMAPPED',
      calculationReliable: false
    };
  }
  if (checks.some(check => check.status === 'UNKNOWN')) {
    return {
      status: 'UNKNOWN',
      code: 'WORKFORCE_COVERAGE_EVIDENCE_MISSING',
      calculationReliable: false
    };
  }
  if (checks.some(check => check.status === 'STALE')) {
    return {
      status: 'STALE',
      code: 'WORKFORCE_COVERAGE_EVIDENCE_STALE',
      calculationReliable: false
    };
  }
  if (checks.some(check => check.status === 'GAP')) {
    return {
      status: 'GAP',
      code: 'WORKFORCE_COVERAGE_GAP',
      calculationReliable: true
    };
  }
  return {
    status: 'COVERED',
    code: 'WORKFORCE_COVERED',
    calculationReliable: true
  };
}

async function resolveBookingCoverage({
  wineryId,
  input,
  transaction = null,
  now = new Date()
}) {
  const loaded = await loadBookingAndMappings({
    wineryId,
    bookingId: input.bookingId,
    transaction
  });
  const booking = loaded.booking;
  const openWork = await loadOpenCoverageWork({
    wineryId,
    bookingId: booking.id,
    transaction
  });
  const demands = loaded.mappings.map(mapping => demandForMapping({
    booking,
    records: loaded.records,
    mapping
  }));
  const checks = [];
  for (const demand of demands) {
    checks.push(await evaluateDemand({
      wineryId,
      demand,
      maxAgeSeconds: input.maxAgeSeconds,
      now,
      transaction
    }));
  }
  const summary = summarizeChecks(checks);
  const observed = checks.map(check => check.observedAt).filter(Boolean).map(value => new Date(value));
  const staleTimes = checks.map(check => check.staleAt).filter(Boolean).map(value => new Date(value));
  const oldestObservedAt = observed.length > 0
    ? new Date(Math.min(...observed.map(value => value.getTime())))
    : null;
  const earliestStaleAt = staleTimes.length > 0
    ? new Date(Math.min(...staleTimes.map(value => value.getTime())))
    : null;
  return {
    schemaVersion: BOOKING_COVERAGE_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    booking: {
      id: booking.id,
      referenceCode: booking.referenceCode,
      status: booking.canonicalStatus,
      startAt: iso(booking.startAt),
      endAt: iso(booking.endAt || booking.startAt),
      locationId: booking.locationId || null,
      primaryAreaId: booking.AreaLinks?.[0]?.areaId || null,
      experienceCode: loaded.experienceCode
    },
    ...summary,
    automationEligible: false,
    demandCount: checks.length,
    gapCount: checks.filter(check => check.status === 'GAP').length,
    checks,
    openWork,
    freshness: {
      status: summary.status === 'UNKNOWN'
        ? 'UNKNOWN'
        : (summary.status === 'STALE' ? 'STALE' : 'FRESH'),
      oldestObservedAt: iso(oldestObservedAt),
      earliestStaleAt: iso(earliestStaleAt),
      maxAgeSeconds: input.maxAgeSeconds
    },
    explanations: [
      'WORKFORCE_CANONICAL_PROJECTION',
      'COMPLETE_ROSTER_WINDOW_REQUIRED',
      summary.code,
      'EXTERNAL_STAFF_IDENTITY_DOES_NOT_GRANT_USER_AUTHORITY',
      'WORKFORCE_AUTOMATION_NOT_ACTIVATED'
    ]
  };
}

function registerBookingCoverageContextPack() {
  return contextPackRegistry.register({
    name: BOOKING_COVERAGE_CONTEXT_PACK,
    description: 'Returns freshness-safe role and skill coverage for one canonical Booking.',
    inputSchema,
    outputSchema,
    resolver: resolveBookingCoverage
  });
}

module.exports = {
  BOOKING_COVERAGE_CONTEXT_PACK,
  BOOKING_COVERAGE_GAP_PURPOSE,
  inputSchema,
  outputSchema,
  sourceRecordsForBooking,
  resolveBookingCoverage,
  registerBookingCoverageContextPack
};
