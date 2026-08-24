const crypto = require('crypto');
const { ValidationError } = require('../utils/errors');

const normalizeId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }
  return id;
};

const normalizeKeyPart = (value, fieldName) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) throw new ValidationError(`${fieldName} is required`);
  return encodeURIComponent(normalized);
};

const buildScopeKey = ({ areaId = null, locationId = null } = {}) => {
  if (areaId != null && locationId != null) {
    throw new ValidationError('A connection scope cannot target an area and a location at the same time');
  }
  if (areaId != null) return `area:${normalizeId(areaId, 'areaId')}`;
  if (locationId != null) return `location:${normalizeId(locationId, 'locationId')}`;
  return 'winery';
};

const buildEventScopeKey = ({
  connectionId = null,
  sourceStream = null,
  resourceType = null,
  resourceId = null,
  intakeKey = null
} = {}) => {
  if (connectionId != null) {
    return `connection:${normalizeId(connectionId, 'connectionId')}:source:${normalizeKeyPart(sourceStream, 'sourceStream')}`;
  }

  if (resourceType != null || resourceId != null) {
    if (resourceType == null || resourceId == null) {
      throw new ValidationError('resourceType and resourceId are both required for a canonical event scope');
    }
    return `canonical:${normalizeKeyPart(resourceType, 'resourceType')}:${normalizeKeyPart(resourceId, 'resourceId')}`;
  }

  if (intakeKey != null) return `intake:${normalizeKeyPart(intakeKey, 'intakeKey')}`;
  throw new ValidationError('An event scope requires a connection stream, canonical resource, or intake key');
};

const buildJobScopeKey = ({ connectionId = null, resourceType = null, streamKey = null } = {}) => {
  const owner = connectionId == null ? 'winery' : `connection:${normalizeId(connectionId, 'connectionId')}`;
  const resource = resourceType == null ? 'general' : normalizeKeyPart(resourceType, 'resourceType');
  const stream = streamKey == null ? 'default' : normalizeKeyPart(streamKey, 'streamKey');
  return `${owner}:resource:${resource}:stream:${stream}`;
};

const buildCanonicalOutboxKey = ({ resourceType, resourceId, revision } = {}) => (
  `canonical:${normalizeKeyPart(resourceType, 'resourceType')}:${normalizeKeyPart(resourceId, 'resourceId')}:revision:${normalizeKeyPart(revision, 'revision')}`
);

const stableSerialize = value => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const buildProjectionIssueFingerprint = ({
  connectionId = null,
  resourceType,
  externalId,
  issueType,
  sourceVersion = null,
  evidence = null
} = {}) => {
  const identity = {
    connectionId: connectionId == null ? null : normalizeId(connectionId, 'connectionId'),
    resourceType: normalizeKeyPart(resourceType, 'resourceType'),
    externalId: normalizeKeyPart(externalId, 'externalId'),
    issueType: normalizeKeyPart(issueType, 'issueType'),
    sourceVersion: sourceVersion == null ? null : String(sourceVersion),
    evidence
  };

  return crypto.createHash('sha256').update(stableSerialize(identity)).digest('hex');
};

module.exports = {
  buildScopeKey,
  buildEventScopeKey,
  buildJobScopeKey,
  buildCanonicalOutboxKey,
  buildProjectionIssueFingerprint,
  stableSerialize
};
