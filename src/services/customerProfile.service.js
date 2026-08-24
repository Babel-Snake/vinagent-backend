const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  CustomerAddress,
  CustomerConsent,
  CustomerContactPoint,
  CustomerLifecycleMilestone,
  CustomerMonetaryRollup,
  CustomerRelationshipRollup,
  Booking,
  IntegrationOperationAuditEvent,
  Member,
  User,
  WineClubMembership,
  SalesOrder,
  Shipment,
  Winery,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');
const { normalizeEmail, normalizePhone } = require('./customerIdentity.service');
const { CUSTOMER_CONTACT_TYPES } = require('./integrationDataRegistry.service');
const businessEntityLinkService = require('./businessEntityLink.service');
const customerRollupService = require('./customerRollup.service');

const CUSTOMER_PROFILE_BACKFILL_ACTION = 'CUSTOMER_PROFILE_BACKFILL_APPLIED';
const CUSTOMER_PROFILE_BACKFILL_VERSION = 'legacy-member-profile-v1';

function normalizedContact(contactType, value) {
  if (!CUSTOMER_CONTACT_TYPES.includes(contactType)) {
    throw new ValidationError('Customer contact type is not supported');
  }
  if (contactType === 'EMAIL') return normalizeEmail(value);
  if (contactType === 'PHONE') return normalizePhone(value);
  return null;
}

function addressValues(member) {
  const values = {
    addressLine1: String(member.addressLine1 || '').trim() || null,
    addressLine2: String(member.addressLine2 || '').trim() || null,
    suburb: String(member.suburb || '').trim() || null,
    state: String(member.state || '').trim() || null,
    postcode: String(member.postcode || '').trim() || null,
    country: String(member.country || '').trim() || null
  };
  return Object.values(values).some(Boolean) ? values : null;
}

function addressFingerprint(address) {
  const normalized = Object.fromEntries(Object.entries(address)
    .map(([key, value]) => [key, value ? String(value).trim().toLowerCase() : null]));
  return crypto.createHash('sha256').update(stableSerialize(normalized)).digest('hex');
}

function plannedMemberProfile(member) {
  const contacts = [];
  const email = normalizedContact('EMAIL', member.email);
  const phone = normalizedContact('PHONE', member.phone);
  if (email) contacts.push({ contactType: 'EMAIL', normalizedValue: email, displayValue: String(member.email).trim() });
  if (phone) contacts.push({ contactType: 'PHONE', normalizedValue: phone, displayValue: String(member.phone).trim() });
  const address = addressValues(member);
  return {
    memberId: member.id,
    memberUpdatedAt: member.updatedAt ? new Date(member.updatedAt).toISOString() : null,
    memberCreatedAt: new Date(member.createdAt).toISOString(),
    contacts,
    address: address ? { ...address, fingerprint: addressFingerprint(address) } : null,
    consentChannels: contacts.map(contact => contact.contactType),
    milestoneKey: 'CUSTOMER_RECORD_CREATED'
  };
}

async function buildCustomerProfileBackfillPreview({ wineryId, transaction = null }) {
  const members = await Member.findAll({
    where: { wineryId },
    attributes: [
      'id',
      'email',
      'phone',
      'addressLine1',
      'addressLine2',
      'suburb',
      'state',
      'postcode',
      'country',
      'createdAt',
      'updatedAt'
    ],
    order: [['id', 'ASC']],
    transaction
  });
  const planned = members.map(plannedMemberProfile);
  const summary = {
    version: CUSTOMER_PROFILE_BACKFILL_VERSION,
    memberCount: planned.length,
    contactPointCount: planned.reduce((count, member) => count + member.contacts.length, 0),
    addressCount: planned.filter(member => member.address).length,
    unknownConsentCount: planned.reduce((count, member) => count + member.consentChannels.length, 0),
    lifecycleMilestoneCount: planned.length
  };
  return {
    ...summary,
    previewToken: crypto.createHash('sha256').update(stableSerialize({
      wineryId,
      version: CUSTOMER_PROFILE_BACKFILL_VERSION,
      planned
    })).digest('hex'),
    rules: {
      memberRemainsWriteAuthority: true,
      consentDefaultsToUnknown: true,
      noMarketingOptInInference: true,
      noExternalIdentityInference: true
    }
  };
}

async function upsertLegacyContact({ wineryId, member, contact, transaction }) {
  const sourceKey = `legacy-member:${member.id}:contact:${contact.contactType.toLowerCase()}:v1`;
  const record = await CustomerContactPoint.findOne({ where: { wineryId, sourceKey }, transaction });
  const values = {
    wineryId,
    memberId: member.id,
    ...contact,
    verificationStatus: 'UNKNOWN',
    verifiedAt: null,
    isPrimary: true,
    isValid: true,
    validFrom: member.createdAt,
    validTo: null,
    suppressedAt: null,
    suppressionReason: null,
    sourceReferenceId: null,
    sourceKind: 'LEGACY_MEMBER',
    sourceKey
  };
  if (record) {
    await record.update(values, { transaction });
    return false;
  }
  await CustomerContactPoint.create(values, { transaction });
  return true;
}

async function upsertLegacyAddress({ wineryId, member, address, transaction }) {
  const sourceKey = `legacy-member:${member.id}:address:primary:v1`;
  const record = await CustomerAddress.findOne({ where: { wineryId, sourceKey }, transaction });
  const values = {
    wineryId,
    memberId: member.id,
    addressType: 'PRIMARY',
    ...address,
    isPrimary: true,
    isValid: true,
    validFrom: member.createdAt,
    validTo: null,
    sourceReferenceId: null,
    sourceKind: 'LEGACY_MEMBER',
    sourceKey
  };
  if (record) {
    await record.update(values, { transaction });
    return false;
  }
  await CustomerAddress.create(values, { transaction });
  return true;
}

async function ensureUnknownConsent({ wineryId, member, channel, transaction }) {
  const sourceKey = `legacy-member:${member.id}:consent:marketing:${channel.toLowerCase()}:unknown:v1`;
  const [, created] = await CustomerConsent.findOrCreate({
    where: { wineryId, sourceKey },
    defaults: {
      wineryId,
      memberId: member.id,
      channel,
      purpose: 'MARKETING',
      state: 'UNKNOWN',
      effectiveAt: member.createdAt,
      expiresAt: null,
      collectionSource: 'LEGACY_MEMBER_NO_PURPOSE_EVIDENCE',
      evidenceReferenceId: null,
      supersedesConsentId: null,
      recordedBy: null,
      sourceKey,
      metadata: { sourceVersion: CUSTOMER_PROFILE_BACKFILL_VERSION }
    },
    transaction
  });
  return created;
}

async function ensureCreationMilestone({ wineryId, member, transaction }) {
  const sourceKey = `legacy-member:${member.id}:milestone:customer-record-created:v1`;
  const [, created] = await CustomerLifecycleMilestone.findOrCreate({
    where: { wineryId, sourceKey },
    defaults: {
      wineryId,
      memberId: member.id,
      milestoneKey: 'CUSTOMER_RECORD_CREATED',
      occurredAt: member.createdAt,
      sourceType: 'MEMBER',
      sourceId: member.id,
      sourceReferenceId: null,
      derivationType: 'OBSERVED_LOCAL_RECORD',
      derivationVersion: '1',
      sourceKey,
      metadata: null
    },
    transaction
  });
  return created;
}

async function applyCustomerProfileBackfill({ wineryId, actorUserId, requestId, previewToken, reason }) {
  return sequelize.transaction(async transaction => {
    const [actor, winery, duplicate] = await Promise.all([
      User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction }),
      Winery.findOne({ where: { id: wineryId }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE }),
      IntegrationOperationAuditEvent.findOne({
        where: { wineryId, action: CUSTOMER_PROFILE_BACKFILL_ACTION, requestId },
        transaction
      })
    ]);
    if (!actor) throw new ValidationError('Customer profile backfill actor does not belong to the winery');
    if (!winery) throw new NotFoundError('Winery not found');
    if (duplicate) return { report: duplicate.afterSnapshot, duplicate: true };
    const preview = await buildCustomerProfileBackfillPreview({ wineryId, transaction });
    if (preview.previewToken !== previewToken) {
      throw new ValidationError('Customer profile backfill preview is stale; generate a new preview');
    }
    const members = await Member.findAll({ where: { wineryId }, order: [['id', 'ASC']], transaction });
    const report = {
      version: CUSTOMER_PROFILE_BACKFILL_VERSION,
      memberCount: members.length,
      contactPointsCreated: 0,
      contactPointsReused: 0,
      addressesCreated: 0,
      addressesReused: 0,
      unknownConsentsCreated: 0,
      unknownConsentsReused: 0,
      milestonesCreated: 0,
      milestonesReused: 0
    };
    for (const member of members) {
      const planned = plannedMemberProfile(member);
      const plannedContactTypes = new Set(planned.contacts.map(contact => contact.contactType));
      const existingLegacyContacts = await CustomerContactPoint.findAll({
        where: { wineryId, memberId: member.id, sourceKind: 'LEGACY_MEMBER' },
        transaction
      });
      for (const existing of existingLegacyContacts) {
        if (!plannedContactTypes.has(existing.contactType)) {
          await existing.update({ isPrimary: false, isValid: false, validTo: new Date() }, { transaction });
        }
      }
      for (const contact of planned.contacts) {
        if (await upsertLegacyContact({ wineryId, member, contact, transaction })) report.contactPointsCreated += 1;
        else report.contactPointsReused += 1;
        if (await ensureUnknownConsent({ wineryId, member, channel: contact.contactType, transaction })) {
          report.unknownConsentsCreated += 1;
        } else report.unknownConsentsReused += 1;
      }
      if (planned.address) {
        if (await upsertLegacyAddress({ wineryId, member, address: planned.address, transaction })) {
          report.addressesCreated += 1;
        } else report.addressesReused += 1;
      } else {
        await CustomerAddress.update({ isPrimary: false, isValid: false, validTo: new Date() }, {
          where: { wineryId, memberId: member.id, sourceKind: 'LEGACY_MEMBER', isValid: true },
          transaction
        });
      }
      if (await ensureCreationMilestone({ wineryId, member, transaction })) report.milestonesCreated += 1;
      else report.milestonesReused += 1;
    }
    await IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: CUSTOMER_PROFILE_BACKFILL_ACTION,
      targetType: 'CUSTOMER_PROFILE_BACKFILL',
      targetId: CUSTOMER_PROFILE_BACKFILL_VERSION,
      resourceType: 'CUSTOMER',
      requestId,
      reason,
      beforeSnapshot: null,
      afterSnapshot: report,
      metadata: { consentPolicy: 'UNKNOWN_WITHOUT_EVIDENCE' }
    }, { transaction });
    return { report, duplicate: false };
  });
}

async function getCustomerRelationshipProfile({ wineryId, memberId }) {
  const member = await Member.findOne({
    where: { id: memberId, wineryId },
    attributes: [
      'id', 'firstName', 'lastName', 'email', 'phone', 'addressLine1', 'addressLine2',
      'suburb', 'state', 'postcode', 'country', 'createdAt', 'updatedAt'
    ]
  });
  if (!member) throw new NotFoundError('Customer not found');
  const [contactPoints, addresses, consentHistory, lifecycleMilestones, canonicalRollups] = await Promise.all([
    CustomerContactPoint.findAll({
      where: { wineryId, memberId },
      order: [['isPrimary', 'DESC'], ['contactType', 'ASC'], ['id', 'ASC']]
    }),
    CustomerAddress.findAll({
      where: { wineryId, memberId },
      order: [['isPrimary', 'DESC'], ['id', 'ASC']]
    }),
    CustomerConsent.findAll({
      where: { wineryId, memberId },
      order: [['effectiveAt', 'DESC'], ['id', 'DESC']]
    }),
    CustomerLifecycleMilestone.findAll({
      where: { wineryId, memberId },
      order: [['occurredAt', 'DESC'], ['id', 'DESC']]
    }),
    customerRollupService.getCustomerRollupsForMember({ wineryId, memberId })
  ]);
  const planned = plannedMemberProfile(member);
  const contactKeys = new Set(contactPoints.filter(item => item.isValid)
    .map(item => `${item.contactType}:${item.normalizedValue}`));
  return {
    member,
    contactPoints,
    addresses,
    consentHistory,
    lifecycleMilestones,
    canonicalRollups,
    migration: {
      writeAuthority: 'MEMBER',
      canonicalChildrenReadOnly: true,
      contactProjectionCurrent: planned.contacts.every(contact => (
        contactKeys.has(`${contact.contactType}:${contact.normalizedValue}`)
      )),
      addressProjectionCurrent: !planned.address || addresses.some(address => (
        address.isValid && address.fingerprint === planned.address.fingerprint
      )),
      affirmativeConsentInferredFromLegacyFlag: false
    }
  };
}

async function transferCustomerProfileForMerge({ wineryId, sourceMemberId, targetMemberId, transaction }) {
  if (!transaction) throw new ValidationError('Customer profile merge transfer requires a transaction');
  const report = {
    contactPoints: 0,
    contactPointDuplicates: 0,
    addresses: 0,
    addressDuplicates: 0,
    consents: 0,
    milestones: 0,
    wineClubMemberships: 0,
    salesOrders: 0,
    canonicalBookings: 0,
    shipments: 0,
    businessEntityLinks: { retargeted: 0, invalidated: 0, duplicateLinksInvalidated: 0 },
    customerRollupsInvalidated: { relationship: 0, monetary: 0 }
  };
  const sourceMemberships = await WineClubMembership.findAll({
    where: { wineryId, memberId: sourceMemberId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  for (const membership of sourceMemberships) {
    const conflict = await WineClubMembership.findOne({
      where: { wineryId, memberId: targetMemberId, programId: membership.programId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (conflict) {
      throw new ValidationError(
        'Customer merge requires Wine Club membership resolution because both customers belong to the same program'
      );
    }
    await membership.update({ memberId: targetMemberId }, { transaction });
    report.wineClubMemberships += 1;
  }
  const salesOrders = await SalesOrder.update(
    { memberId: targetMemberId },
    { where: { wineryId, memberId: sourceMemberId }, transaction }
  );
  report.salesOrders = salesOrders[0];
  const canonicalBookings = await Booking.update(
    { memberId: targetMemberId },
    { where: { wineryId, memberId: sourceMemberId }, transaction }
  );
  report.canonicalBookings = canonicalBookings[0];
  const shipments = await Shipment.update(
    { memberId: targetMemberId },
    { where: { wineryId, memberId: sourceMemberId }, transaction }
  );
  report.shipments = shipments[0];
  report.businessEntityLinks = await businessEntityLinkService.retargetCustomerLinksForMerge({
    wineryId,
    sourceMemberId,
    targetMemberId,
    transaction
  });
  const [relationshipRollups, monetaryRollups] = await Promise.all([
    CustomerRelationshipRollup.destroy({
      where: { wineryId, memberId: { [Op.in]: [sourceMemberId, targetMemberId] } },
      transaction
    }),
    CustomerMonetaryRollup.destroy({
      where: { wineryId, memberId: { [Op.in]: [sourceMemberId, targetMemberId] } },
      transaction
    })
  ]);
  report.customerRollupsInvalidated = {
    relationship: relationshipRollups,
    monetary: monetaryRollups
  };
  const sourceContacts = await CustomerContactPoint.findAll({ where: { wineryId, memberId: sourceMemberId }, transaction });
  for (const contact of sourceContacts) {
    const duplicate = await CustomerContactPoint.findOne({
      where: {
        wineryId,
        memberId: targetMemberId,
        contactType: contact.contactType,
        normalizedValue: contact.normalizedValue
      },
      transaction
    });
    if (duplicate) {
      await duplicate.update({
        isPrimary: duplicate.isPrimary || contact.isPrimary,
        isValid: duplicate.isValid || contact.isValid,
        verificationStatus: duplicate.verificationStatus === 'VERIFIED'
          ? duplicate.verificationStatus
          : contact.verificationStatus,
        verifiedAt: duplicate.verifiedAt || contact.verifiedAt
      }, { transaction });
      await contact.destroy({ transaction });
      report.contactPointDuplicates += 1;
    } else {
      await contact.update({ memberId: targetMemberId }, { transaction });
      report.contactPoints += 1;
    }
  }
  const sourceAddresses = await CustomerAddress.findAll({ where: { wineryId, memberId: sourceMemberId }, transaction });
  for (const address of sourceAddresses) {
    const duplicate = await CustomerAddress.findOne({
      where: { wineryId, memberId: targetMemberId, fingerprint: address.fingerprint },
      transaction
    });
    if (duplicate) {
      await duplicate.update({ isPrimary: duplicate.isPrimary || address.isPrimary, isValid: duplicate.isValid || address.isValid }, {
        transaction
      });
      await Shipment.update(
        { restrictedAddressId: duplicate.id },
        { where: { wineryId, restrictedAddressId: address.id }, transaction }
      );
      await address.destroy({ transaction });
      report.addressDuplicates += 1;
    } else {
      await address.update({ memberId: targetMemberId }, { transaction });
      report.addresses += 1;
    }
  }
  const [consents, milestones] = await Promise.all([
    CustomerConsent.update({ memberId: targetMemberId }, { where: { wineryId, memberId: sourceMemberId }, transaction }),
    CustomerLifecycleMilestone.update(
      { memberId: targetMemberId },
      { where: { wineryId, memberId: sourceMemberId }, transaction }
    )
  ]);
  report.consents = consents[0];
  report.milestones = milestones[0];
  return report;
}

module.exports = {
  CUSTOMER_PROFILE_BACKFILL_ACTION,
  CUSTOMER_PROFILE_BACKFILL_VERSION,
  normalizedContact,
  addressValues,
  addressFingerprint,
  plannedMemberProfile,
  buildCustomerProfileBackfillPreview,
  applyCustomerProfileBackfill,
  getCustomerRelationshipProfile,
  transferCustomerProfileForMerge
};
