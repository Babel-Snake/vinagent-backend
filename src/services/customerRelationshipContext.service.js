const Joi = require('joi');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');

const CUSTOMER_RELATIONSHIP_CONTEXT_PACK = 'customer.relationship.v1';
const inputSchema = Joi.object({
  memberId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(2592000).default(86400)
}).unknown(false);

const nullableIso = Joi.string().isoDate().allow(null);
const activitySchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  status: Joi.string().max(40).required(),
  occurredAt: nullableIso
}).unknown(false).allow(null);

const outputSchema = Joi.object({
  schemaVersion: Joi.string().valid(CUSTOMER_RELATIONSHIP_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  customer: Joi.object({
    id: Joi.number().integer().positive().required(),
    customerType: Joi.string().max(40).required(),
    createdAt: Joi.string().isoDate().required()
  }).unknown(false).required(),
  contactability: Joi.object({
    validContactPointCount: Joi.number().integer().min(0).required(),
    emailAvailable: Joi.boolean().required(),
    verifiedEmailAvailable: Joi.boolean().required(),
    phoneAvailable: Joi.boolean().required(),
    verifiedPhoneAvailable: Joi.boolean().required()
  }).unknown(false).required(),
  marketingConsent: Joi.object({
    EMAIL: Joi.string().valid('UNKNOWN', 'GRANTED', 'DENIED', 'REVOKED').required(),
    SMS: Joi.string().valid('UNKNOWN', 'GRANTED', 'DENIED', 'REVOKED').required(),
    PHONE: Joi.string().valid('UNKNOWN', 'GRANTED', 'DENIED', 'REVOKED').required(),
    ANY: Joi.string().valid('UNKNOWN', 'GRANTED', 'DENIED', 'REVOKED').required()
  }).unknown(false).required(),
  relationship: Joi.object({
    rollupAvailable: Joi.boolean().required(),
    activeClubMembershipCount: Joi.number().integer().min(0).allow(null).required(),
    isCurrentClubMember: Joi.boolean().allow(null).required(),
    completedBookingCount: Joi.number().integer().min(0).allow(null).required(),
    purchaseOrderCount: Joi.number().integer().min(0).allow(null).required(),
    lastVisitAt: nullableIso,
    lastPurchaseAt: nullableIso,
    sourceOverlapStatus: Joi.string().max(40).allow(null).required(),
    authorityStatus: Joi.string().max(40).allow(null).required(),
    calculatedAt: nullableIso
  }).unknown(false).required(),
  memberships: Joi.array().items(Joi.object({
    membershipId: Joi.number().integer().positive().required(),
    programId: Joi.number().integer().positive().required(),
    programCode: Joi.string().max(120).required(),
    programName: Joi.string().max(160).required(),
    status: Joi.string().max(40).required(),
    nextChargeAt: nullableIso,
    nextReviewAt: nullableIso,
    observedAt: Joi.string().isoDate().required()
  }).unknown(false)).max(20).required(),
  monetary: Joi.array().items(Joi.object({
    currency: Joi.string().length(3).required(),
    grossPaidMinor: Joi.number().integer().required(),
    refundedMinor: Joi.number().integer().required(),
    netPaidMinor: Joi.number().integer().required(),
    contributingOrderCount: Joi.number().integer().min(0).required(),
    sourceOverlapStatus: Joi.string().max(40).required(),
    authorityStatus: Joi.string().max(40).required(),
    calculatedAt: Joi.string().isoDate().required()
  }).unknown(false)).max(20).required(),
  recentActivity: Joi.object({
    booking: activitySchema,
    order: activitySchema,
    shipment: Joi.object({
      id: Joi.number().integer().positive().required(),
      status: Joi.string().max(40).required(),
      occurredAt: nullableIso,
      exceptionCategory: Joi.string().max(40).required()
    }).unknown(false).allow(null),
    contact: Joi.object({
      messageId: Joi.number().integer().positive().required(),
      channel: Joi.string().valid('sms', 'email', 'voice').required(),
      direction: Joi.string().valid('inbound', 'outbound').required(),
      occurredAt: Joi.string().isoDate().required(),
      deliveryStatus: Joi.string().max(40).required()
    }).unknown(false).allow(null)
  }).unknown(false).required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(100).required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('CURRENT', 'STALE', 'UNKNOWN', 'CONFLICTING').required(),
    calculatedAt: nullableIso,
    ageSeconds: Joi.number().integer().min(0).allow(null).required(),
    maxAgeSeconds: Joi.number().integer().min(60).max(2592000).required()
  }).unknown(false).required(),
  automationEligible: Joi.boolean().valid(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(20).required()
}).unknown(false);

const iso = value => value ? new Date(value).toISOString() : null;
const number = value => Number(value || 0);

function currentMarketingConsent(consents, now = new Date()) {
  const result = { EMAIL: 'UNKNOWN', SMS: 'UNKNOWN', PHONE: 'UNKNOWN', ANY: 'UNKNOWN' };
  const seen = new Set();
  for (const consent of consents) {
    if (consent.purpose !== 'MARKETING' || seen.has(consent.channel)) continue;
    if (new Date(consent.effectiveAt) > now) continue;
    seen.add(consent.channel);
    result[consent.channel] = consent.expiresAt && new Date(consent.expiresAt) <= now
      ? 'UNKNOWN'
      : consent.state;
  }
  return result;
}

async function resolveCustomerRelationship({
  wineryId,
  input,
  transaction = null,
  now = new Date()
}) {
  const member = await models.Member.findOne({
    where: { id: input.memberId, wineryId },
    attributes: ['id', 'customerType', 'createdAt'],
    transaction
  });
  if (!member) throw new NotFoundError('Customer not found');
  const [
    contacts,
    consents,
    relationship,
    monetary,
    memberships,
    lastBooking,
    lastOrder,
    lastShipment,
    lastMessage,
    openTasks
  ] = await Promise.all([
    models.CustomerContactPoint.findAll({
      where: { wineryId, memberId: member.id, isValid: true },
      attributes: ['contactType', 'verificationStatus'],
      transaction
    }),
    models.CustomerConsent.findAll({
      where: { wineryId, memberId: member.id },
      attributes: ['channel', 'purpose', 'state', 'effectiveAt', 'expiresAt'],
      order: [['effectiveAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    models.CustomerRelationshipRollup.findOne({
      where: { wineryId, memberId: member.id },
      transaction
    }),
    models.CustomerMonetaryRollup.findAll({
      where: { wineryId, memberId: member.id },
      order: [['currency', 'ASC']],
      transaction
    }),
    models.WineClubMembership.findAll({
      where: { wineryId, memberId: member.id },
      attributes: [
        'id', 'programId', 'canonicalStatus', 'nextChargeAt', 'nextReviewAt', 'observedAt'
      ],
      include: [{ association: 'Program', attributes: ['id', 'code', 'name'] }],
      order: [['observedAt', 'DESC'], ['id', 'DESC']],
      limit: 20,
      transaction
    }),
    models.Booking.findOne({
      where: { wineryId, memberId: member.id },
      attributes: ['id', 'canonicalStatus', 'startAt'],
      order: [['startAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    models.SalesOrder.findOne({
      where: { wineryId, memberId: member.id },
      attributes: ['id', 'canonicalStatus', 'placedAt'],
      order: [['placedAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    models.Shipment.findOne({
      where: { wineryId, memberId: member.id },
      attributes: ['id', 'canonicalStatus', 'latestTrackingOccurredAt', 'latestExceptionCategory'],
      order: [['latestTrackingOccurredAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    models.Message.findOne({
      where: { wineryId, memberId: member.id },
      attributes: [
        'id', 'source', 'direction', 'receivedAt', 'createdAt', 'canonicalDeliveryStatus'
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    models.Task.findAll({
      where: { wineryId, memberId: member.id, status: 'PENDING' },
      attributes: ['id'],
      order: [['id', 'ASC']],
      limit: 100,
      transaction
    })
  ]);
  const calculatedAt = relationship?.calculatedAt || null;
  const ageSeconds = calculatedAt
    ? Math.max(0, Math.floor((now - new Date(calculatedAt)) / 1000))
    : null;
  let freshnessStatus = 'CURRENT';
  if (!relationship) freshnessStatus = 'UNKNOWN';
  else if (relationship.sourceOverlapStatus !== 'CLEAR') freshnessStatus = 'CONFLICTING';
  else if (ageSeconds > input.maxAgeSeconds) freshnessStatus = 'STALE';
  const emailContacts = contacts.filter(contact => contact.contactType === 'EMAIL');
  const phoneContacts = contacts.filter(contact => contact.contactType === 'PHONE');
  return {
    schemaVersion: CUSTOMER_RELATIONSHIP_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    customer: {
      id: member.id,
      customerType: member.customerType,
      createdAt: iso(member.createdAt)
    },
    contactability: {
      validContactPointCount: contacts.length,
      emailAvailable: emailContacts.length > 0,
      verifiedEmailAvailable: emailContacts.some(contact => contact.verificationStatus === 'VERIFIED'),
      phoneAvailable: phoneContacts.length > 0,
      verifiedPhoneAvailable: phoneContacts.some(contact => contact.verificationStatus === 'VERIFIED')
    },
    marketingConsent: currentMarketingConsent(consents, now),
    relationship: {
      rollupAvailable: Boolean(relationship),
      activeClubMembershipCount: relationship ? relationship.activeClubMembershipCount : null,
      isCurrentClubMember: relationship ? relationship.isCurrentClubMember : null,
      completedBookingCount: relationship ? relationship.completedBookingCount : null,
      purchaseOrderCount: relationship ? relationship.purchaseOrderCount : null,
      lastVisitAt: iso(relationship?.lastVisitAt),
      lastPurchaseAt: iso(relationship?.lastPurchaseAt),
      sourceOverlapStatus: relationship?.sourceOverlapStatus || null,
      authorityStatus: relationship?.authorityStatus || null,
      calculatedAt: iso(calculatedAt)
    },
    memberships: memberships.map(membership => ({
      membershipId: membership.id,
      programId: membership.programId,
      programCode: membership.Program.code,
      programName: membership.Program.name,
      status: membership.canonicalStatus,
      nextChargeAt: iso(membership.nextChargeAt),
      nextReviewAt: iso(membership.nextReviewAt),
      observedAt: iso(membership.observedAt)
    })),
    monetary: monetary.map(rollup => ({
      currency: rollup.currency,
      grossPaidMinor: number(rollup.grossPaidMinor),
      refundedMinor: number(rollup.refundedMinor),
      netPaidMinor: number(rollup.netPaidMinor),
      contributingOrderCount: rollup.contributingOrderCount,
      sourceOverlapStatus: rollup.sourceOverlapStatus,
      authorityStatus: rollup.authorityStatus,
      calculatedAt: iso(rollup.calculatedAt)
    })),
    recentActivity: {
      booking: lastBooking ? {
        id: lastBooking.id,
        status: lastBooking.canonicalStatus,
        occurredAt: iso(lastBooking.startAt)
      } : null,
      order: lastOrder ? {
        id: lastOrder.id,
        status: lastOrder.canonicalStatus,
        occurredAt: iso(lastOrder.placedAt)
      } : null,
      shipment: lastShipment ? {
        id: lastShipment.id,
        status: lastShipment.canonicalStatus,
        occurredAt: iso(lastShipment.latestTrackingOccurredAt),
        exceptionCategory: lastShipment.latestExceptionCategory
      } : null,
      contact: lastMessage ? {
        messageId: lastMessage.id,
        channel: lastMessage.source,
        direction: lastMessage.direction,
        occurredAt: iso(lastMessage.receivedAt || lastMessage.createdAt),
        deliveryStatus: lastMessage.canonicalDeliveryStatus
      } : null
    },
    openWork: {
      taskCount: openTasks.length,
      taskIds: openTasks.map(task => task.id)
    },
    freshness: {
      status: freshnessStatus,
      calculatedAt: iso(calculatedAt),
      ageSeconds,
      maxAgeSeconds: input.maxAgeSeconds
    },
    automationEligible: false,
    explanations: [
      'CUSTOMER_CANONICAL_PROFILE',
      relationship ? 'CUSTOMER_ROLLUP_AVAILABLE' : 'CUSTOMER_ROLLUP_UNAVAILABLE',
      'CONTACT_VALUES_EXCLUDED',
      'RESTRICTED_PROFILE_FIELDS_EXCLUDED',
      'CUSTOMER_RELATIONSHIP_AUTOMATION_NOT_ACTIVATED'
    ]
  };
}

function registerCustomerRelationshipContextPack() {
  return contextPackRegistry.register({
    name: CUSTOMER_RELATIONSHIP_CONTEXT_PACK,
    description: 'Returns bounded customer relationship, consent, activity, rollup, and open-work context.',
    inputSchema,
    outputSchema,
    resolver: resolveCustomerRelationship
  });
}

module.exports = {
  CUSTOMER_RELATIONSHIP_CONTEXT_PACK,
  inputSchema,
  outputSchema,
  currentMarketingConsent,
  resolveCustomerRelationship,
  registerCustomerRelationshipContextPack
};
