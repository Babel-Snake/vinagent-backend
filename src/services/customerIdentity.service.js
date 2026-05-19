const { Op } = require('sequelize');
const { Member } = require('../models');

const AUTO_CREATE_MEMBER_CATEGORIES = new Set(['BOOKING', 'ORDER', 'ACCOUNT']);
const DEFAULT_IDENTITY_MATCHING_CONFIG = {
  autoLinkThreshold: 180,
  reviewThreshold: 120,
  maxReviewCandidates: 3,
  allowPhoneSuffixNameAutoLink: true,
  allowNameOnlyReview: true
};

function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function normalizePhone(value) {
  return value ? String(value).replace(/[^\d+]/g, '').trim() : null;
}

function canonicalPhoneDigits(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  const digitsOnly = normalized.replace(/[^\d]/g, '');
  return digitsOnly || null;
}

function getComparablePhoneSuffix(value, length = 8) {
  const digits = canonicalPhoneDigits(value);
  if (!digits) return null;
  return digits.slice(-length);
}

function normalizeName(value) {
  return value ? String(value).trim().replace(/\s+/g, ' ').toLowerCase() : null;
}

function splitRequesterName(name) {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { firstName: 'Unknown', lastName: 'Contact' };
  }

  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Contact' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

function mapInboundMethodToMemberSource(inboundMethod) {
  if (inboundMethod === 'sms') return 'sms';
  if (inboundMethod === 'email') return 'email';
  if (inboundMethod === 'in_person') return 'walk_in';
  if (inboundMethod === 'phone') return 'manual';
  return 'manual';
}

function mapInboundMethodToPreferredContactMethod(inboundMethod) {
  if (inboundMethod === 'sms') return 'sms';
  if (inboundMethod === 'email') return 'email';
  if (inboundMethod === 'phone') return 'phone';
  return 'any';
}

function getIdentityMatchingConfig(settings) {
  return {
    ...DEFAULT_IDENTITY_MATCHING_CONFIG,
    ...(settings?.identityMatchingConfig || {})
  };
}

function scoreToConfidence(score) {
  if (score >= 180) return 'HIGH';
  if (score >= 120) return 'MEDIUM';
  return 'LOW';
}

function scoreMemberCandidate(member, intake) {
  let score = 0;
  const reasons = [];

  const memberEmail = normalizeEmail(member.email);
  const memberPhone = canonicalPhoneDigits(member.phone);
  const memberPhoneSuffix = getComparablePhoneSuffix(member.phone);
  const memberFullName = normalizeName(`${member.firstName || ''} ${member.lastName || ''}`);

  if (intake.email && memberEmail === intake.email) {
    score += 200;
    reasons.push('email_exact');
  }

  if (intake.phone && memberPhone && memberPhone === intake.phone) {
    score += 180;
    reasons.push('phone_exact');
  } else if (intake.phoneSuffix && memberPhoneSuffix && memberPhoneSuffix === intake.phoneSuffix) {
    score += 120;
    reasons.push('phone_suffix');
  }

  if (intake.fullName && memberFullName === intake.fullName) {
    score += 90;
    reasons.push('full_name_exact');
  } else {
    const memberFirst = normalizeName(member.firstName);
    const memberLast = normalizeName(member.lastName);
    if (intake.firstName && memberFirst === intake.firstName) {
      score += 30;
      reasons.push('first_name_exact');
    }
    if (intake.lastName && memberLast === intake.lastName) {
      score += 35;
      reasons.push('last_name_exact');
    }
    if (intake.fullName && memberFullName && memberFullName.includes(intake.fullName)) {
      score += 25;
      reasons.push('full_name_contains');
    }
  }

  return { score, reasons };
}

function shouldAcceptMemberCandidate(candidateScore, intake, identityConfig) {
  const { score, reasons } = candidateScore;
  if (reasons.includes('email_exact') || reasons.includes('phone_exact')) {
    return true;
  }
  if (
    identityConfig.allowPhoneSuffixNameAutoLink
    && reasons.includes('phone_suffix')
    && (reasons.includes('full_name_exact') || reasons.includes('last_name_exact'))
  ) {
    return true;
  }
  if (
    identityConfig.allowNameOnlyReview
    && reasons.includes('full_name_exact')
    && !intake.email
    && !intake.phone
    && score >= identityConfig.autoLinkThreshold
  ) {
    return true;
  }
  return score >= identityConfig.autoLinkThreshold;
}

function buildIntakeIdentityState({
  linkedMemberId,
  originalMemberId,
  matchReason,
  suggestedCandidates = []
}) {
  if (originalMemberId) {
    return {
      identityResolutionStatus: 'SELECTED_MEMBER',
      identityConfidence: 'HIGH',
      memberAutoLinked: false,
      memberMatchReason: 'selected_member',
      suggestedCandidates: [],
      suggestedMemberId: null,
      suggestedMemberLabel: null,
      suggestedMemberReason: null
    };
  }

  if (linkedMemberId && /created_from_(manual_)?external_intake/.test(matchReason || '')) {
    return {
      identityResolutionStatus: 'AUTO_CREATED',
      identityConfidence: 'HIGH',
      memberAutoLinked: true,
      memberMatchReason: matchReason,
      suggestedCandidates: [],
      suggestedMemberId: null,
      suggestedMemberLabel: null,
      suggestedMemberReason: null
    };
  }

  if (linkedMemberId && matchReason) {
    const confidence = /email_exact|phone_exact/.test(matchReason) ? 'HIGH' : 'MEDIUM';
    return {
      identityResolutionStatus: 'AUTO_LINKED',
      identityConfidence: confidence,
      memberAutoLinked: true,
      memberMatchReason: matchReason,
      suggestedCandidates: [],
      suggestedMemberId: null,
      suggestedMemberLabel: null,
      suggestedMemberReason: null
    };
  }

  if (suggestedCandidates.length > 0) {
    const primarySuggestedCandidate = suggestedCandidates[0];
    return {
      identityResolutionStatus: 'REVIEW_REQUIRED',
      identityConfidence: primarySuggestedCandidate.confidence || 'LOW',
      memberAutoLinked: false,
      memberMatchReason: null,
      suggestedCandidates,
      suggestedMemberId: primarySuggestedCandidate.memberId,
      suggestedMemberLabel: primarySuggestedCandidate.label,
      suggestedMemberReason: primarySuggestedCandidate.reason
    };
  }

  return {
    identityResolutionStatus: 'UNRESOLVED',
    identityConfidence: 'NONE',
    memberAutoLinked: false,
    memberMatchReason: null,
    suggestedCandidates: [],
    suggestedMemberId: null,
    suggestedMemberLabel: null,
    suggestedMemberReason: null
  };
}

async function resolveExternalIdentity({
  wineryId,
  memberId,
  category,
  taskOrigin = 'EXTERNAL',
  inboundMethod,
  requesterName,
  requesterEmail,
  requesterPhone,
  identityConfig = DEFAULT_IDENTITY_MATCHING_CONFIG,
  transaction,
  allowAutoCreate = true
}) {
  if (memberId) {
    return { memberId, matchReason: 'selected_member', suggestedCandidates: [], matchedMember: null };
  }

  if (taskOrigin !== 'EXTERNAL') {
    return { memberId: null, matchReason: null, suggestedCandidates: [], matchedMember: null };
  }

  const normalizedEmail = normalizeEmail(requesterEmail);
  const normalizedPhone = canonicalPhoneDigits(requesterPhone);
  const normalizedPhoneSuffix = getComparablePhoneSuffix(requesterPhone);
  const normalizedName = normalizeName(requesterName);
  const nameParts = splitRequesterName(requesterName);
  const normalizedFirstName = normalizeName(nameParts.firstName);
  const normalizedLastName = normalizeName(nameParts.lastName);
  const intakeIdentity = {
    email: normalizedEmail,
    phone: normalizedPhone,
    phoneSuffix: normalizedPhoneSuffix,
    fullName: normalizedName,
    firstName: normalizedFirstName,
    lastName: normalizedLastName
  };

  if (!normalizedEmail && !normalizedPhone && !normalizedName) {
    return { memberId: null, matchReason: null, suggestedCandidates: [], matchedMember: null };
  }

  const searchConditions = [];
  if (normalizedEmail) {
    searchConditions.push({ email: normalizedEmail });
  }
  if (normalizedPhoneSuffix) {
    searchConditions.push({ phone: { [Op.like]: `%${normalizedPhoneSuffix}%` } });
  }
  if (normalizedFirstName) {
    searchConditions.push({ firstName: { [Op.like]: `${nameParts.firstName}%` } });
  }
  if (normalizedLastName && normalizedLastName !== 'contact') {
    searchConditions.push({ lastName: { [Op.like]: `${nameParts.lastName}%` } });
  }

  const candidates = searchConditions.length > 0
    ? await Member.findAll({
      where: {
        wineryId,
        [Op.or]: searchConditions
      },
      transaction,
      limit: 25
    })
    : [];

  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      ...scoreMemberCandidate(candidate, intakeIdentity)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredCandidates[0];
  if (bestMatch && shouldAcceptMemberCandidate(bestMatch, intakeIdentity, identityConfig)) {
    const member = bestMatch.candidate;
    const memberUpdates = {};
    if (!member.email && normalizedEmail) memberUpdates.email = normalizedEmail;
    if (!member.phone && requesterPhone) memberUpdates.phone = normalizePhone(requesterPhone);
    memberUpdates.lastContactAt = new Date();
    if (Object.keys(memberUpdates).length > 0) {
      await member.update(memberUpdates, { transaction });
    }
    return {
      memberId: member.id,
      matchReason: `matched:${bestMatch.reasons.join('+') || 'scored_candidate'}`,
      suggestedCandidates: [],
      matchedMember: member
    };
  }

  const suggestedCandidates = scoredCandidates
    .filter((entry) => {
      if (entry.score < identityConfig.reviewThreshold) return false;
      if (!identityConfig.allowNameOnlyReview && entry.reasons.length === 1 && entry.reasons.includes('full_name_exact')) {
        return false;
      }
      return true;
    })
    .slice(0, identityConfig.maxReviewCandidates)
    .map((entry) => ({
      memberId: entry.candidate.id,
      label: `${entry.candidate.firstName || ''} ${entry.candidate.lastName || ''}`.trim(),
      confidence: scoreToConfidence(entry.score),
      reason: `review:${entry.reasons.join('+') || 'scored_candidate'}`,
      score: entry.score,
      email: entry.candidate.email || null,
      phone: entry.candidate.phone || null
    }));

  if (suggestedCandidates.length > 0) {
    return {
      memberId: null,
      matchReason: null,
      suggestedCandidates,
      matchedMember: null
    };
  }

  const hasCreateableIdentity = Boolean(
    normalizedEmail
    || normalizedPhone
    || (normalizedFirstName && normalizedLastName && normalizedLastName !== 'contact')
  );

  if (!allowAutoCreate || !AUTO_CREATE_MEMBER_CATEGORIES.has(category) || !hasCreateableIdentity) {
    return { memberId: null, matchReason: null, suggestedCandidates: [], matchedMember: null };
  }

  const createdMember = await Member.create({
    wineryId,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: normalizedEmail,
    phone: normalizePhone(requesterPhone),
    source: mapInboundMethodToMemberSource(inboundMethod),
    preferredContactMethod: mapInboundMethodToPreferredContactMethod(inboundMethod),
    lastContactAt: new Date(),
    notes: 'Auto-created from external intake.'
  }, { transaction });

  return {
    memberId: createdMember.id,
    matchReason: 'created_from_external_intake',
    suggestedCandidates: [],
    matchedMember: createdMember
  };
}

module.exports = {
  DEFAULT_IDENTITY_MATCHING_CONFIG,
  buildIntakeIdentityState,
  getIdentityMatchingConfig,
  normalizeEmail,
  normalizePhone,
  resolveExternalIdentity
};
