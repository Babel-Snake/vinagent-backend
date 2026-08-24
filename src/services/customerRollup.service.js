const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  Booking,
  BusinessEntityLink,
  CustomerMonetaryRollup,
  CustomerRelationshipRollup,
  CustomerRollupContribution,
  CustomerRollupRun,
  Member,
  SalesOrder,
  User,
  WineClubMembership,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');

const CUSTOMER_ROLLUP_CALCULATION_VERSION = 'canonical-customer-rollup-v1';
const CURRENT_CLUB_STATUSES = new Set(['ACTIVE', 'PAUSED', 'PAYMENT_HOLD', 'CANCELLING']);
const PURCHASE_ORDER_STATUSES = new Set([
  'PAID',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED'
]);

function hash(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

const iso = value => value ? new Date(value).toISOString() : null;

async function loadRollupInputs({ wineryId, transaction }) {
  const [members, memberships, bookings, orders, overlapLinks] = await Promise.all([
    Member.findAll({
      where: { wineryId },
      attributes: ['id'],
      order: [['id', 'ASC']],
      raw: true,
      transaction
    }),
    WineClubMembership.findAll({
      where: { wineryId },
      attributes: [
        'id', 'memberId', 'canonicalStatus', 'joinedAt', 'activatedAt', 'sourceUpdatedAt',
        'deletedAtSource', 'authorityConnectionId'
      ],
      order: [['id', 'ASC']],
      raw: true,
      transaction
    }),
    Booking.findAll({
      where: { wineryId },
      attributes: [
        'id', 'memberId', 'canonicalStatus', 'startAt', 'completedAt', 'sourceUpdatedAt',
        'isSourceDeleted', 'authorityConnectionId'
      ],
      order: [['id', 'ASC']],
      raw: true,
      transaction
    }),
    SalesOrder.findAll({
      where: { wineryId },
      attributes: [
        'id', 'memberId', 'customerResolutionStatus', 'canonicalStatus', 'paymentStatus',
        'currency', 'paidMinor', 'refundedMinor', 'placedAt', 'paidAt', 'sourceUpdatedAt',
        'deletedAtSource', 'authorityConnectionId'
      ],
      order: [['id', 'ASC']],
      raw: true,
      transaction
    }),
    BusinessEntityLink.findAll({
      where: {
        wineryId,
        relationshipType: 'POSSIBLE_SAME_SALES_ORDER',
        confirmationStatus: { [Op.in]: ['UNREVIEWED', 'CONFIRMED'] },
        isActive: true
      },
      attributes: ['id', 'sourceId', 'targetId', 'confirmationStatus', 'confidence', 'updatedAt'],
      order: [['id', 'ASC']],
      raw: true,
      transaction
    })
  ]);
  return { members, memberships, bookings, orders, overlapLinks };
}

function rollupInputState(inputs) {
  return {
    calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
    members: inputs.members.map(item => item.id),
    memberships: inputs.memberships.map(item => ({
      id: item.id,
      memberId: item.memberId,
      status: item.canonicalStatus,
      joinedAt: iso(item.joinedAt),
      activatedAt: iso(item.activatedAt),
      sourceUpdatedAt: iso(item.sourceUpdatedAt),
      deletedAtSource: iso(item.deletedAtSource),
      authorityConnectionId: item.authorityConnectionId
    })),
    bookings: inputs.bookings.map(item => ({
      id: item.id,
      memberId: item.memberId,
      status: item.canonicalStatus,
      startAt: iso(item.startAt),
      completedAt: iso(item.completedAt),
      sourceUpdatedAt: iso(item.sourceUpdatedAt),
      isSourceDeleted: Boolean(item.isSourceDeleted),
      authorityConnectionId: item.authorityConnectionId
    })),
    orders: inputs.orders.map(item => ({
      id: item.id,
      memberId: item.memberId,
      customerResolutionStatus: item.customerResolutionStatus,
      status: item.canonicalStatus,
      paymentStatus: item.paymentStatus,
      currency: item.currency,
      paidMinor: item.paidMinor == null ? null : String(item.paidMinor),
      refundedMinor: item.refundedMinor == null ? null : String(item.refundedMinor),
      placedAt: iso(item.placedAt),
      paidAt: iso(item.paidAt),
      sourceUpdatedAt: iso(item.sourceUpdatedAt),
      deletedAtSource: iso(item.deletedAtSource),
      authorityConnectionId: item.authorityConnectionId
    })),
    overlapLinks: inputs.overlapLinks.map(item => ({
      id: item.id,
      sourceId: item.sourceId,
      targetId: item.targetId,
      confirmationStatus: item.confirmationStatus,
      confidence: item.confidence == null ? null : Number(item.confidence),
      updatedAt: iso(item.updatedAt)
    }))
  };
}

function previewFromInputs({ wineryId, inputs }) {
  const state = rollupInputState(inputs);
  const inputHash = hash(state);
  const previewToken = hash({
    wineryId,
    inputHash,
    calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
    authorityStatus: 'SHADOW_UNVERIFIED',
    automationEligible: false
  });
  return {
    calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
    previewToken,
    inputHash,
    counts: {
      members: inputs.members.length,
      wineClubMemberships: inputs.memberships.length,
      bookings: inputs.bookings.length,
      salesOrders: inputs.orders.length,
      possibleDuplicateOrderLinks: inputs.overlapLinks.length
    },
    policy: {
      writesLegacyMemberRollups: false,
      separatesCurrencies: true,
      unresolvedCustomersExcluded: true,
      possibleDuplicateOrdersRemainCounted: true,
      authorityStatus: 'SHADOW_UNVERIFIED',
      automationEligible: false
    }
  };
}

async function buildCustomerRollupPreview({ wineryId, transaction }) {
  return previewFromInputs({ wineryId, inputs: await loadRollupInputs({ wineryId, transaction }) });
}

const laterDate = (current, candidate) => {
  if (!candidate) return current || null;
  if (!current) return new Date(candidate);
  return new Date(candidate) > new Date(current) ? new Date(candidate) : current;
};

function toMinorInteger(value) {
  if (value == null || value === '') return 0n;
  try {
    return BigInt(String(value));
  } catch {
    throw new ValidationError('Canonical monetary rollup input is not an integer minor-unit value');
  }
}

function contributionKey(value) {
  return hash(value);
}

function buildCustomerRollups(inputs) {
  const memberStates = new Map(inputs.members.map(member => [member.id, {
    memberId: member.id,
    activeClubMembershipCount: 0,
    completedBookingCount: 0,
    purchaseOrderCount: 0,
    lastVisitAt: null,
    lastPurchaseAt: null,
    sourceOverlapStatus: 'CLEAR',
    monetary: new Map()
  }]));
  const contributions = [];
  const addContribution = value => {
    contributions.push({
      ...value,
      contributionKey: contributionKey({
        subjectMemberId: value.subjectMemberId,
        resourceType: value.resourceType,
        resourceId: value.resourceId,
        contributionType: value.contributionType,
        currency: value.currency || null
      })
    });
  };

  for (const membership of inputs.memberships) {
    const state = memberStates.get(membership.memberId);
    if (!state || membership.deletedAtSource || !CURRENT_CLUB_STATUSES.has(membership.canonicalStatus)) continue;
    state.activeClubMembershipCount += 1;
    addContribution({
      subjectMemberId: membership.memberId,
      resourceType: 'WINE_CLUB_MEMBERSHIP',
      resourceId: membership.id,
      contributionType: 'CURRENT_CLUB_MEMBERSHIP',
      currency: null,
      amountMinor: null,
      effectiveAt: membership.activatedAt || membership.joinedAt || membership.sourceUpdatedAt || null,
      authorityConnectionId: membership.authorityConnectionId,
      metadata: { canonicalStatus: membership.canonicalStatus }
    });
  }

  for (const booking of inputs.bookings) {
    const state = memberStates.get(booking.memberId);
    if (!state || booking.isSourceDeleted || booking.canonicalStatus !== 'COMPLETED') continue;
    state.completedBookingCount += 1;
    const effectiveAt = booking.completedAt || booking.startAt || booking.sourceUpdatedAt || null;
    state.lastVisitAt = laterDate(state.lastVisitAt, effectiveAt);
    addContribution({
      subjectMemberId: booking.memberId,
      resourceType: 'BOOKING',
      resourceId: booking.id,
      contributionType: 'COMPLETED_BOOKING',
      currency: null,
      amountMinor: null,
      effectiveAt,
      authorityConnectionId: booking.authorityConnectionId,
      metadata: { canonicalStatus: booking.canonicalStatus }
    });
  }

  const includedOrders = new Map();
  for (const order of inputs.orders) {
    const state = memberStates.get(order.memberId);
    if (!state || order.deletedAtSource || order.customerResolutionStatus !== 'RESOLVED'
      || !PURCHASE_ORDER_STATUSES.has(order.canonicalStatus)) {
      continue;
    }
    includedOrders.set(order.id, order);
    state.purchaseOrderCount += 1;
    const effectiveAt = order.paidAt || order.placedAt || order.sourceUpdatedAt || null;
    state.lastPurchaseAt = laterDate(state.lastPurchaseAt, effectiveAt);
    addContribution({
      subjectMemberId: order.memberId,
      resourceType: 'SALES_ORDER',
      resourceId: order.id,
      contributionType: 'PURCHASE_ORDER',
      currency: null,
      amountMinor: null,
      effectiveAt,
      authorityConnectionId: order.authorityConnectionId,
      metadata: {
        canonicalStatus: order.canonicalStatus,
        paymentStatus: order.paymentStatus
      }
    });
    if (!order.currency || (order.paidMinor == null && order.refundedMinor == null)) continue;
    const grossPaidMinor = toMinorInteger(order.paidMinor);
    const refundedMinor = toMinorInteger(order.refundedMinor);
    const currency = String(order.currency).toUpperCase();
    const monetary = state.monetary.get(currency) || {
      currency,
      grossPaidMinor: 0n,
      refundedMinor: 0n,
      contributingOrderIds: new Set()
    };
    monetary.grossPaidMinor += grossPaidMinor;
    monetary.refundedMinor += refundedMinor;
    monetary.contributingOrderIds.add(order.id);
    state.monetary.set(currency, monetary);
    addContribution({
      subjectMemberId: order.memberId,
      resourceType: 'SALES_ORDER',
      resourceId: order.id,
      contributionType: 'ORDER_NET_PAYMENT',
      currency,
      amountMinor: String(grossPaidMinor - refundedMinor),
      effectiveAt,
      authorityConnectionId: order.authorityConnectionId,
      metadata: {
        grossPaidMinor: String(grossPaidMinor),
        refundedMinor: String(refundedMinor)
      }
    });
  }

  for (const link of inputs.overlapLinks) {
    const sourceOrder = includedOrders.get(link.sourceId);
    const targetOrder = includedOrders.get(link.targetId);
    if (sourceOrder) memberStates.get(sourceOrder.memberId).sourceOverlapStatus = 'POSSIBLE_DUPLICATES';
    if (targetOrder) memberStates.get(targetOrder.memberId).sourceOverlapStatus = 'POSSIBLE_DUPLICATES';
  }

  const relationshipRollups = [];
  const monetaryRollups = [];
  for (const state of memberStates.values()) {
    relationshipRollups.push({
      memberId: state.memberId,
      activeClubMembershipCount: state.activeClubMembershipCount,
      isCurrentClubMember: state.activeClubMembershipCount > 0,
      completedBookingCount: state.completedBookingCount,
      purchaseOrderCount: state.purchaseOrderCount,
      lastVisitAt: state.lastVisitAt,
      lastPurchaseAt: state.lastPurchaseAt,
      sourceOverlapStatus: state.sourceOverlapStatus
    });
    for (const monetary of state.monetary.values()) {
      monetaryRollups.push({
        memberId: state.memberId,
        currency: monetary.currency,
        grossPaidMinor: String(monetary.grossPaidMinor),
        refundedMinor: String(monetary.refundedMinor),
        netPaidMinor: String(monetary.grossPaidMinor - monetary.refundedMinor),
        contributingOrderCount: monetary.contributingOrderIds.size,
        sourceOverlapStatus: state.sourceOverlapStatus
      });
    }
  }
  return { relationshipRollups, monetaryRollups, contributions };
}

function serializeRun(run) {
  const plain = run.toJSON ? run.toJSON() : run;
  return {
    id: plain.id,
    wineryId: plain.wineryId,
    requestId: plain.requestId,
    calculationVersion: plain.calculationVersion,
    status: plain.status,
    initiatedBy: plain.initiatedBy,
    reason: plain.reason,
    memberCount: plain.memberCount,
    relationshipRollupCount: plain.relationshipRollupCount,
    monetaryRollupCount: plain.monetaryRollupCount,
    contributionCount: plain.contributionCount,
    startedAt: plain.startedAt,
    completedAt: plain.completedAt,
    createdAt: plain.createdAt
  };
}

async function rebuildCustomerRollups({
  wineryId,
  actorUserId,
  requestId,
  previewToken,
  reason
}) {
  return sequelize.transaction(async transaction => {
    const actor = await User.findOne({
      where: { id: actorUserId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!actor) throw new ValidationError('Customer rollup actor does not belong to the winery');
    const prior = await CustomerRollupRun.findOne({
      where: { wineryId, requestId },
      transaction
    });
    if (prior) {
      if (prior.previewToken !== previewToken || prior.reason !== reason) {
        throw new ValidationError('requestId was already used for another customer rollup rebuild');
      }
      return { run: serializeRun(prior), duplicate: true, automationEligible: false };
    }
    const inputs = await loadRollupInputs({ wineryId, transaction });
    const preview = previewFromInputs({ wineryId, inputs });
    if (preview.previewToken !== previewToken) {
      throw new ValidationError('Customer rollup preview is stale; generate a new preview');
    }
    const startedAt = new Date();
    const run = await CustomerRollupRun.create({
      wineryId,
      requestId,
      previewToken,
      inputHash: preview.inputHash,
      calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
      status: 'RUNNING',
      initiatedBy: actorUserId,
      reason,
      startedAt
    }, { transaction });
    const calculated = buildCustomerRollups(inputs);
    const calculatedAt = new Date();
    for (const values of calculated.relationshipRollups) {
      const common = {
        ...values,
        wineryId,
        lastRunId: run.id,
        authorityStatus: 'SHADOW_UNVERIFIED',
        calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
        calculatedAt,
        automationEligible: false
      };
      const existing = await CustomerRelationshipRollup.findOne({
        where: { wineryId, memberId: values.memberId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existing) await existing.update(common, { transaction });
      else await CustomerRelationshipRollup.create(common, { transaction });
    }
    await CustomerMonetaryRollup.destroy({ where: { wineryId }, transaction });
    if (calculated.monetaryRollups.length > 0) {
      await CustomerMonetaryRollup.bulkCreate(calculated.monetaryRollups.map(values => ({
        ...values,
        wineryId,
        lastRunId: run.id,
        authorityStatus: 'SHADOW_UNVERIFIED',
        calculationVersion: CUSTOMER_ROLLUP_CALCULATION_VERSION,
        calculatedAt,
        automationEligible: false
      })), { transaction });
    }
    if (calculated.contributions.length > 0) {
      await CustomerRollupContribution.bulkCreate(calculated.contributions.map(values => ({
        ...values,
        wineryId,
        runId: run.id
      })), { transaction });
    }
    await run.update({
      status: 'COMPLETE',
      memberCount: inputs.members.length,
      relationshipRollupCount: calculated.relationshipRollups.length,
      monetaryRollupCount: calculated.monetaryRollups.length,
      contributionCount: calculated.contributions.length,
      completedAt: calculatedAt
    }, { transaction });
    return { run: serializeRun(run), duplicate: false, automationEligible: false };
  });
}

async function listCustomerRollupRuns({ wineryId, page = 1, pageSize = 25 }) {
  const result = await CustomerRollupRun.findAndCountAll({
    where: { wineryId },
    include: [{ association: 'Initiator', attributes: ['id', 'displayName', 'role'] }],
    order: [['startedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    customerRollupRuns: result.rows.map(row => ({
      ...serializeRun(row),
      Initiator: row.Initiator
    })),
    pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) }
  };
}

async function getCustomerRollupRun({ wineryId, runId, page = 1, pageSize = 100 }) {
  const run = await CustomerRollupRun.findOne({
    where: { id: runId, wineryId },
    include: [{ association: 'Initiator', attributes: ['id', 'displayName', 'role'] }]
  });
  if (!run) throw new NotFoundError('Customer rollup run not found');
  const result = await CustomerRollupContribution.findAndCountAll({
    where: { wineryId, runId },
    order: [['subjectMemberId', 'ASC'], ['resourceType', 'ASC'], ['resourceId', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return {
    run: { ...serializeRun(run), Initiator: run.Initiator },
    contributions: result.rows,
    pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) },
    automationEligible: false
  };
}

async function getCustomerRollupsForMember({ wineryId, memberId }) {
  const [relationship, monetary] = await Promise.all([
    CustomerRelationshipRollup.findOne({
      where: { wineryId, memberId },
      include: [{ association: 'LastRun', attributes: ['id', 'calculationVersion', 'completedAt'] }]
    }),
    CustomerMonetaryRollup.findAll({
      where: { wineryId, memberId },
      include: [{ association: 'LastRun', attributes: ['id', 'calculationVersion', 'completedAt'] }],
      order: [['currency', 'ASC']]
    })
  ]);
  return {
    relationship,
    monetary,
    available: Boolean(relationship),
    writesLegacyMemberRollups: false,
    automationEligible: false
  };
}

module.exports = {
  CUSTOMER_ROLLUP_CALCULATION_VERSION,
  buildCustomerRollupPreview,
  buildCustomerRollups,
  rebuildCustomerRollups,
  listCustomerRollupRuns,
  getCustomerRollupRun,
  getCustomerRollupsForMember
};
