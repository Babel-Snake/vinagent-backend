const { CustomerMergeRedirect, ExternalResourceReference } = require('../models');
const { ValidationError } = require('../utils/errors');

async function resolveCustomerRedirect({ wineryId, memberId, transaction = null, maxHops = 20 }) {
  let currentId = Number(memberId);
  if (!Number.isSafeInteger(currentId) || currentId <= 0) throw new ValidationError('memberId must be a positive integer');
  const visited = new Set();
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (visited.has(currentId)) throw new ValidationError('Customer merge redirect loop detected');
    visited.add(currentId);
    const redirect = await CustomerMergeRedirect.findOne({
      where: { wineryId, sourceMemberId: currentId },
      transaction
    });
    if (!redirect) return { memberId: currentId, redirected: currentId !== Number(memberId), hops: visited.size - 1 };
    currentId = redirect.targetMemberId;
  }
  throw new ValidationError('Customer merge redirect chain exceeds the supported depth');
}

async function recordCustomerMerge({
  wineryId,
  sourceMemberId,
  targetMemberId,
  mergedBy = null,
  reason = 'manager_merge',
  metadata = null,
  transaction
}) {
  const sourceId = Number(sourceMemberId);
  const targetId = Number(targetMemberId);
  if (!transaction) throw new ValidationError('Customer merge redirects must be written inside the merge transaction');
  if (!Number.isSafeInteger(sourceId) || !Number.isSafeInteger(targetId) || sourceId <= 0 || targetId <= 0) {
    throw new ValidationError('Customer merge IDs must be positive integers');
  }
  if (sourceId === targetId) throw new ValidationError('A customer cannot redirect to itself');
  const finalTarget = await resolveCustomerRedirect({ wineryId, memberId: targetId, transaction });
  if (finalTarget.memberId === sourceId) throw new ValidationError('Customer merge would create a redirect loop');

  const existing = await CustomerMergeRedirect.findOne({
    where: { wineryId, sourceMemberId: sourceId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (existing) {
    if (existing.targetMemberId !== finalTarget.memberId) {
      throw new ValidationError('Customer source already redirects to a different target');
    }
    return { redirect: existing, retargetedExternalReferences: 0, collapsedRedirects: 0, duplicate: true };
  }

  const [collapsedRedirects] = await CustomerMergeRedirect.update({ targetMemberId: finalTarget.memberId }, {
    where: { wineryId, targetMemberId: sourceId },
    transaction
  });
  const [retargetedExternalReferences] = await ExternalResourceReference.update({ canonicalId: finalTarget.memberId }, {
    where: { wineryId, canonicalType: 'CUSTOMER', canonicalId: sourceId },
    transaction
  });
  const redirect = await CustomerMergeRedirect.create({
    wineryId,
    sourceMemberId: sourceId,
    targetMemberId: finalTarget.memberId,
    mergedBy,
    reason,
    mergedAt: new Date(),
    metadata
  }, { transaction });
  return { redirect, retargetedExternalReferences, collapsedRedirects, duplicate: false };
}

module.exports = {
  resolveCustomerRedirect,
  recordCustomerMerge
};
