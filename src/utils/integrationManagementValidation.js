const Joi = require('joi');
const {
  INTEGRATION_DOMAINS,
  CONNECTION_STATUSES,
  AUTHORITY_RESOLUTION_STRATEGIES,
  AUTHORITY_SOURCE_ROLES,
  INTEGRATION_JOB_STATUSES,
  CANONICAL_OUTBOX_STATUSES,
  SYNC_STREAM_OPERATIONAL_STATUSES,
  LOCATION_AREA_RELATIONSHIP_TYPES,
  CANONICAL_BOOKING_STATUSES,
  PROJECTION_ISSUE_TYPES,
  PROJECTION_ISSUE_STATUSES,
  PROJECTION_ISSUE_SEVERITIES,
  WINE_CLUB_MEMBERSHIP_STATUSES,
  SALES_ORDER_STATUSES,
  BUSINESS_ENTITY_RELATIONSHIP_TYPES,
  BUSINESS_ENTITY_LINK_CONFIRMATION_STATUSES,
  CANONICAL_RESOURCE_TYPES,
  INVENTORY_COMMITMENT_SOURCE_TYPES,
  INVENTORY_COMMITMENT_STATUSES,
  INVENTORY_DEMAND_SOURCE_RECORD_TYPES,
  INVENTORY_DEMAND_MAPPING_STATUSES,
  SHIPMENT_STATUSES,
  STAFF_EMPLOYMENT_STATUSES,
  ROLE_SKILL_DEFINITION_KINDS,
  STAFF_ROLE_SKILL_STATUSES,
  ROSTER_SHIFT_STATUSES,
  STAFF_AVAILABILITY_TYPES,
  STAFF_AVAILABILITY_STATUSES,
  WORKFORCE_DEMAND_SOURCE_RECORD_TYPES,
  WORKFORCE_DEMAND_MAPPING_STATUSES,
  MESSAGE_DELIVERY_STATUSES,
  MESSAGE_DELIVERY_FAILURE_CATEGORIES,
  INTELLIGENCE_FACT_QUALITY_CLASSES,
  INTELLIGENCE_FACT_RUN_STATUSES
} = require('../services/integrationDataRegistry.service');

const stableKey = max => Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9._-]*$/).max(max);
const nullableText = max => Joi.string().trim().max(max).allow('', null);
const upperStableKey = max => Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9._-]*$/).max(max);
const pagination = {
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25)
};

const connectionScopeSchema = Joi.object({
  domain: Joi.string().trim().uppercase().valid(...INTEGRATION_DOMAINS).required(),
  areaId: Joi.number().integer().positive().allow(null),
  locationId: Joi.number().integer().positive().allow(null),
  priority: Joi.number().integer().min(-1000).max(1000).default(0),
  isDefault: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true)
}).oxor('areaId', 'locationId').unknown(false);

const connectionCreateSchema = Joi.object({
  connectionKey: stableKey(120).required(),
  providerKey: stableKey(120).required(),
  displayName: Joi.string().trim().min(1).max(160).required(),
  externalAccountId: nullableText(255),
  externalLocationId: nullableText(255),
  configuration: Joi.object().unknown(true).allow(null),
  scopes: Joi.array().items(connectionScopeSchema).min(1).max(30).required()
}).unknown(false);

const connectionUpdateSchema = Joi.object({
  displayName: Joi.string().trim().min(1).max(160),
  externalAccountId: nullableText(255),
  externalLocationId: nullableText(255),
  configuration: Joi.object().unknown(true).allow(null),
  lifecycleAction: Joi.string().valid('DISABLE', 'ENABLE_PENDING')
}).min(1).unknown(false);

const connectionListSchema = Joi.object({
  ...pagination,
  providerKey: stableKey(120),
  status: Joi.string().uppercase().valid('ALL', ...CONNECTION_STATUSES).default('ALL'),
  domain: Joi.string().uppercase().valid('ALL', ...INTEGRATION_DOMAINS).default('ALL')
}).unknown(false);

const locationCreateSchema = Joi.object({
  code: stableKey(80).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  locationType: upperStableKey(80).required(),
  parentLocationId: Joi.number().integer().positive().allow(null),
  timeZone: Joi.string().trim().max(80).default('Australia/Adelaide'),
  addressLine1: nullableText(255),
  addressLine2: nullableText(255),
  suburb: nullableText(120),
  state: nullableText(120),
  postcode: nullableText(24),
  country: nullableText(120),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const locationUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(160),
  locationType: upperStableKey(80),
  parentLocationId: Joi.number().integer().positive().allow(null),
  timeZone: Joi.string().trim().max(80),
  addressLine1: nullableText(255),
  addressLine2: nullableText(255),
  suburb: nullableText(120),
  state: nullableText(120),
  postcode: nullableText(24),
  country: nullableText(120),
  isActive: Joi.boolean(),
  metadata: Joi.object().unknown(true).allow(null)
}).min(1).unknown(false);

const locationAreaLinkSchema = Joi.object({
  areaId: Joi.number().integer().positive().required(),
  relationshipType: Joi.string().trim().uppercase().valid(...LOCATION_AREA_RELATIONSHIP_TYPES).required()
}).unknown(false);

const authorityPolicyCreateSchema = Joi.object({
  areaId: Joi.number().integer().positive().allow(null),
  locationId: Joi.number().integer().positive().allow(null),
  domain: Joi.string().trim().uppercase().valid(...INTEGRATION_DOMAINS).required(),
  fieldGroup: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(120).required(),
  resolutionStrategy: Joi.string().trim().uppercase().valid(...AUTHORITY_RESOLUTION_STRATEGIES).required(),
  baselineFreshnessSeconds: Joi.number().integer().min(0).max(31536000).allow(null),
  definition: Joi.object().unknown(true).allow(null),
  sources: Joi.array().items(Joi.object({
    connectionId: Joi.number().integer().positive().required(),
    sourceRole: Joi.string().trim().uppercase().valid(...AUTHORITY_SOURCE_ROLES).required(),
    sourceOrder: Joi.number().integer().min(0).max(100).required(),
    configuration: Joi.object().unknown(true).allow(null)
  }).unknown(false)).max(30).default([])
}).oxor('areaId', 'locationId').unknown(false);

const authorityPolicyActivateSchema = Joi.object({
  effectiveAt: Joi.date().iso().default(() => new Date())
}).unknown(false);

const authorityPolicyListSchema = Joi.object({
  ...pagination,
  domain: Joi.string().trim().uppercase().valid('ALL', ...INTEGRATION_DOMAINS).default('ALL'),
  fieldGroup: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(120),
  scopeKey: Joi.string().trim().max(180)
}).unknown(false);

const jobListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...INTEGRATION_JOB_STATUSES).default('ALL'),
  jobKind: Joi.string().trim().uppercase().max(120),
  connectionId: Joi.number().integer().positive()
}).unknown(false);

const syncStreamListSchema = Joi.object({
  ...pagination,
  connectionId: Joi.number().integer().positive(),
  resourceType: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(120),
  operationalStatus: Joi.string().trim().uppercase().valid('ALL', ...SYNC_STREAM_OPERATIONAL_STATUSES).default('ALL')
}).unknown(false);

const integrationOperationCommandSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const integrationOperationAuditListSchema = Joi.object({
  ...pagination,
  action: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(80),
  targetType: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(80),
  connectionId: Joi.number().integer().positive()
}).unknown(false);

const outboxListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...CANONICAL_OUTBOX_STATUSES).default('ALL'),
  aggregateType: Joi.string().trim().uppercase().max(120)
}).unknown(false);

const credentialUpsertSchema = Joi.object({
  credentialType: Joi.string().trim().uppercase().valid(
    'BEARER_TOKEN',
    'API_KEY',
    'BASIC',
    'OAUTH_CLIENT_CREDENTIALS'
  ).required(),
  secret: Joi.object().unknown(true).required()
}).unknown(false);

const webhookEndpointCreateSchema = Joi.object({
  domain: Joi.string().trim().uppercase().valid(...INTEGRATION_DOMAINS).required(),
  adapterKey: stableKey(120).required(),
  configuration: Joi.object({
    maxAgeSeconds: Joi.number().integer().min(30).max(3600).default(300)
  }).unknown(false).default({ maxAgeSeconds: 300 })
}).unknown(false);

const webhookEndpointLifecycleSchema = Joi.object({
  action: Joi.string().trim().uppercase().valid('DISABLE', 'ENABLE', 'REVOKE').required()
}).unknown(false);

const compatibilityBackfillIssueListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED').default('ALL')
}).unknown(false);

const projectionIssueListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...PROJECTION_ISSUE_STATUSES).default('ALL'),
  severity: Joi.string().trim().uppercase().valid('ALL', ...PROJECTION_ISSUE_SEVERITIES).default('ALL'),
  issueType: Joi.string().trim().uppercase().valid(...PROJECTION_ISSUE_TYPES),
  connectionId: Joi.number().integer().positive()
}).unknown(false);

const projectionIssueResolveSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  decision: Joi.string().trim().uppercase().valid(
    'KEEP_SEPARATE',
    'SELECT_CANDIDATE',
    'RETAIN_CANDIDATE',
    'RETAIN_EXISTING',
    'LEGACY_SOURCE_CORRECTED'
  ).required(),
  selectedConnectionKey: stableKey(120)
}).unknown(false);

const configurationAuthorityListSchema = Joi.object({
  domain: Joi.string().trim().uppercase().valid('ALL', ...INTEGRATION_DOMAINS).default('ALL')
}).unknown(false);

const configurationAuthorityPrepareSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  previewToken: Joi.string().hex().length(64).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const configurationAuthorityActivateSchema = configurationAuthorityPrepareSchema.keys({
  acknowledgeOneWriter: Joi.boolean().valid(true).required()
});

const configurationAuthorityRollbackSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  acknowledgeLegacyRestore: Joi.boolean().valid(true).required()
}).unknown(false);

const customerProfileBackfillApplySchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  previewToken: Joi.string().hex().length(64).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const wineClubProgramCreateSchema = Joi.object({
  code: stableKey(100).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  tier: nullableText(80),
  cadence: nullableText(80),
  benefitsSummary: nullableText(4000),
  isActive: Joi.boolean().default(true)
}).unknown(false);

const wineClubProgramListSchema = Joi.object({
  includeInactive: Joi.boolean().default(false)
}).unknown(false);

const wineClubMembershipListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...WINE_CLUB_MEMBERSHIP_STATUSES).default('ALL'),
  memberId: Joi.number().integer().positive(),
  programId: Joi.number().integer().positive()
}).unknown(false);

const salesOrderListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...SALES_ORDER_STATUSES).default('ALL'),
  memberId: Joi.number().integer().positive(),
  connectionId: Joi.number().integer().positive(),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

const businessEntityLinkListSchema = Joi.object({
  ...pagination,
  relationshipType: Joi.string().trim().uppercase()
    .valid('ALL', ...BUSINESS_ENTITY_RELATIONSHIP_TYPES).default('ALL'),
  confirmationStatus: Joi.string().trim().uppercase()
    .valid('ALL', ...BUSINESS_ENTITY_LINK_CONFIRMATION_STATUSES).default('ALL'),
  entityType: Joi.string().trim().uppercase().valid(...CANONICAL_RESOURCE_TYPES),
  entityId: Joi.number().integer().positive()
}).and('entityType', 'entityId').unknown(false);

const businessEntityLinkCreateSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  relationshipType: Joi.string().trim().uppercase().valid(...BUSINESS_ENTITY_RELATIONSHIP_TYPES).required(),
  sourceType: Joi.string().trim().uppercase().valid(...CANONICAL_RESOURCE_TYPES).required(),
  sourceId: Joi.number().integer().positive().required(),
  targetType: Joi.string().trim().uppercase().valid(...CANONICAL_RESOURCE_TYPES).required(),
  targetId: Joi.number().integer().positive().required()
}).unknown(false);

const businessEntityLinkCommandSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const customerRollupRebuildSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  previewToken: Joi.string().hex().length(64).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const customerRollupRunListSchema = Joi.object({
  ...pagination
}).unknown(false);

const productVariantCreateSchema = Joi.object({
  wineryProductId: Joi.number().integer().positive().required(),
  code: stableKey(100).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  sku: nullableText(160),
  barcode: nullableText(160),
  format: nullableText(80),
  volume: Joi.number().positive().precision(3).max(999999999.999).allow(null),
  volumeUnit: upperStableKey(40).allow(null),
  packSize: Joi.number().positive().precision(3).max(999999999.999).default(1),
  unitOfMeasure: upperStableKey(40).required(),
  isSellable: Joi.boolean().default(true),
  isActive: Joi.boolean().default(true),
  isDefault: Joi.boolean().default(false)
}).unknown(false);

const productVariantListSchema = Joi.object({
  ...pagination,
  includeInactive: Joi.boolean().default(false),
  wineryProductId: Joi.number().integer().positive()
}).unknown(false);

const stockLocationCreateSchema = Joi.object({
  wineryLocationId: Joi.number().integer().positive().allow(null),
  code: stableKey(100).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  locationType: upperStableKey(80).required(),
  isActive: Joi.boolean().default(true),
  isDefault: Joi.boolean().default(false)
}).unknown(false);

const stockLocationListSchema = Joi.object({
  ...pagination,
  includeInactive: Joi.boolean().default(false),
  wineryLocationId: Joi.number().integer().positive()
}).unknown(false);

const inventoryPositionListSchema = Joi.object({
  ...pagination,
  productVariantId: Joi.number().integer().positive(),
  stockLocationId: Joi.number().integer().positive(),
  freshness: Joi.string().trim().uppercase()
    .valid('ALL', 'FRESH', 'STALE', 'CONFLICTING', 'DELETED').default('ALL')
}).unknown(false);

const inventoryPositionDetailSchema = Joi.object({
  snapshotLimit: Joi.number().integer().min(1).max(100).default(25)
}).unknown(false);

const inventoryCommitmentListSchema = Joi.object({
  ...pagination,
  productVariantId: Joi.number().integer().positive(),
  stockLocationId: Joi.number().integer().positive(),
  sourceType: Joi.string().trim().uppercase().valid(...INVENTORY_COMMITMENT_SOURCE_TYPES),
  sourceId: Joi.number().integer().positive(),
  status: Joi.string().trim().uppercase().valid('ALL', ...INVENTORY_COMMITMENT_STATUSES).default('ALL')
}).and('sourceType', 'sourceId').unknown(false);

const inventoryAvailabilitySchema = Joi.object({
  productVariantId: Joi.number().integer().positive().required(),
  stockLocationId: Joi.number().integer().positive().required(),
  requiredAt: Joi.date().iso().default(() => new Date()),
  additionalRequiredQuantity: Joi.number().min(0).precision(3).max(999999999.999).default(0),
  includeIncoming: Joi.boolean().default(false),
  unit: upperStableKey(40)
}).unknown(false);

const inventoryDemandMappingUpsertSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  sourceRecordType: Joi.string().trim().uppercase().valid(...INVENTORY_DEMAND_SOURCE_RECORD_TYPES).required(),
  sourceConnectionId: Joi.number().integer().positive().allow(null),
  sourceCode: Joi.string().trim().min(1).max(160).required(),
  productVariantId: Joi.number().integer().positive().required(),
  stockLocationId: Joi.number().integer().positive().required(),
  quantityMultiplier: Joi.number().positive().precision(3).max(999999999.999).default(1),
  unit: upperStableKey(40).required(),
  status: Joi.string().trim().uppercase().valid(...INVENTORY_DEMAND_MAPPING_STATUSES).default('ACTIVE')
}).unknown(false);

const inventoryDemandMappingListSchema = Joi.object({
  ...pagination,
  sourceRecordType: Joi.string().trim().uppercase().valid(...INVENTORY_DEMAND_SOURCE_RECORD_TYPES),
  status: Joi.string().trim().uppercase().valid('ALL', ...INVENTORY_DEMAND_MAPPING_STATUSES).default('ALL')
}).unknown(false);

const shipmentListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...SHIPMENT_STATUSES).default('ALL'),
  memberId: Joi.number().integer().positive(),
  salesOrderId: Joi.number().integer().positive(),
  wineClubAllocationId: Joi.number().integer().positive(),
  connectionId: Joi.number().integer().positive(),
  exceptionOnly: Joi.boolean().default(false),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

const staffIdentityUpsertSchema = Joi.object({
  id: Joi.number().integer().positive(),
  userId: Joi.number().integer().positive().allow(null),
  wineryContactId: Joi.number().integer().positive().allow(null),
  displayName: Joi.string().trim().min(1).max(160).required(),
  employmentStatus: Joi.string().trim().uppercase().valid(...STAFF_EMPLOYMENT_STATUSES).required(),
  isActive: Joi.boolean().default(true),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const staffIdentityListSchema = Joi.object({
  ...pagination,
  includeInactive: Joi.boolean().default(false),
  userId: Joi.number().integer().positive()
}).unknown(false);

const roleSkillDefinitionUpsertSchema = Joi.object({
  id: Joi.number().integer().positive(),
  definitionKind: Joi.string().trim().uppercase().valid(...ROLE_SKILL_DEFINITION_KINDS).required(),
  code: upperStableKey(120).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  description: nullableText(4000),
  isActive: Joi.boolean().default(true),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const roleSkillDefinitionListSchema = Joi.object({
  ...pagination,
  definitionKind: Joi.string().trim().uppercase().valid(...ROLE_SKILL_DEFINITION_KINDS),
  includeInactive: Joi.boolean().default(false)
}).unknown(false);

const staffRoleSkillUpsertSchema = Joi.object({
  staffIdentityId: Joi.number().integer().positive().required(),
  definitionId: Joi.number().integer().positive().required(),
  status: Joi.string().trim().uppercase().valid(...STAFF_ROLE_SKILL_STATUSES).default('ACTIVE'),
  proficiencyLevel: nullableText(80),
  validFrom: Joi.date().iso().allow(null),
  validTo: Joi.date().iso().greater(Joi.ref('validFrom')).allow(null),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const rosterShiftListSchema = Joi.object({
  ...pagination,
  staffIdentityId: Joi.number().integer().positive(),
  locationId: Joi.number().integer().positive(),
  areaId: Joi.number().integer().positive(),
  status: Joi.string().trim().uppercase().valid('ALL', ...ROSTER_SHIFT_STATUSES).default('ALL'),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

const staffAvailabilityListSchema = Joi.object({
  ...pagination,
  staffIdentityId: Joi.number().integer().positive(),
  availabilityType: Joi.string().trim().uppercase().valid(...STAFF_AVAILABILITY_TYPES),
  status: Joi.string().trim().uppercase().valid('ALL', ...STAFF_AVAILABILITY_STATUSES).default('ALL'),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

const workforceDemandMappingUpsertSchema = Joi.object({
  sourceRecordType: Joi.string().trim().uppercase()
    .valid(...WORKFORCE_DEMAND_SOURCE_RECORD_TYPES).required(),
  sourceConnectionId: Joi.number().integer().positive().allow(null),
  sourceCode: Joi.string().trim().min(1).max(160).required(),
  definitionId: Joi.number().integer().positive().required(),
  areaId: Joi.number().integer().positive().allow(null),
  locationId: Joi.number().integer().positive().allow(null),
  headcountMultiplier: Joi.number().positive().precision(3).max(1000).default(1),
  bufferBeforeMinutes: Joi.number().integer().min(0).max(10080).default(0),
  bufferAfterMinutes: Joi.number().integer().min(0).max(10080).default(0),
  status: Joi.string().trim().uppercase().valid(...WORKFORCE_DEMAND_MAPPING_STATUSES).default('ACTIVE'),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const workforceDemandMappingListSchema = Joi.object({
  ...pagination,
  sourceRecordType: Joi.string().trim().uppercase().valid(...WORKFORCE_DEMAND_SOURCE_RECORD_TYPES),
  status: Joi.string().trim().uppercase()
    .valid('ALL', ...WORKFORCE_DEMAND_MAPPING_STATUSES).default('ALL')
}).unknown(false);

const bookingCoverageSchema = Joi.object({
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600)
}).unknown(false);

const messageDeliveryListSchema = Joi.object({
  ...pagination,
  messageId: Joi.number().integer().positive(),
  connectionId: Joi.number().integer().positive(),
  status: Joi.string().trim().uppercase()
    .valid('ALL', ...MESSAGE_DELIVERY_STATUSES)
    .default('ALL'),
  failureCategory: Joi.string().trim().uppercase()
    .valid('ALL', ...MESSAGE_DELIVERY_FAILURE_CATEGORIES)
    .default('ALL'),
  failuresOnly: Joi.boolean().default(false),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

const intelligenceFactListSchema = Joi.object({
  ...pagination,
  subjectType: Joi.string().trim().uppercase().valid(...CANONICAL_RESOURCE_TYPES),
  subjectId: Joi.number().integer().positive(),
  factKey: Joi.string().trim().lowercase()
    .pattern(/^[a-z0-9][a-z0-9._:-]*$/)
    .max(160),
  qualityClass: Joi.string().trim().uppercase().valid(...INTELLIGENCE_FACT_QUALITY_CLASSES),
  freshness: Joi.string().trim().uppercase().valid('ALL', 'CURRENT', 'STALE').default('ALL'),
  currentOnly: Joi.boolean().default(true)
}).with('subjectId', 'subjectType').unknown(false);

const intelligenceFactMaterializeSchema = Joi.object({
  materializerKey: Joi.string().trim().lowercase()
    .valid('booking.readiness.v1', 'shipment.exception.v1', 'message.delivery.v1')
    .required(),
  subjectId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(3600),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const intelligenceFactRunListSchema = Joi.object({
  ...pagination,
  materializerKey: Joi.string().trim().lowercase()
    .valid('booking.readiness.v1', 'shipment.exception.v1', 'message.delivery.v1'),
  subjectType: Joi.string().trim().uppercase().valid('BOOKING', 'SHIPMENT', 'MESSAGE'),
  subjectId: Joi.number().integer().positive(),
  status: Joi.string().trim().uppercase()
    .valid('ALL', ...INTELLIGENCE_FACT_RUN_STATUSES)
    .default('ALL')
}).with('subjectId', 'subjectType').unknown(false);

const customerRelationshipContextSchema = Joi.object({
  maxAgeSeconds: Joi.number().integer().min(60).max(2592000).default(86400)
}).unknown(false);

const clubFulfilmentContextSchema = Joi.object({
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600)
}).unknown(false);

const areaCapacityContextSchema = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().greater(Joi.ref('from')).required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600),
  maxBookings: Joi.number().integer().min(1).max(200).default(100)
}).unknown(false);

const integrationHealthSchema = Joi.object({
  domain: Joi.string().trim().uppercase().valid('ALL', ...INTEGRATION_DOMAINS).default('ALL'),
  connectionId: Joi.number().integer().positive(),
  maxAgeSeconds: Joi.number().integer().min(60).max(2592000).default(86400),
  recentRunHours: Joi.number().integer().min(1).max(720).default(24)
}).unknown(false);

const domainActivationPreviewSchema = Joi.object({
  scopeKey: Joi.string().trim().max(180).default('winery')
}).unknown(false);

const domainActivationSchema = Joi.object({
  scopeKey: Joi.string().trim().max(180).default('winery'),
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  previewToken: Joi.string().hex().length(64).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  acknowledgeNonRetroactive: Joi.boolean().valid(true).required()
}).unknown(false);

const domainActivationDisableSchema = Joi.object({
  scopeKey: Joi.string().trim().max(180).default('winery'),
  reason: Joi.string().trim().min(10).max(1000).required()
}).unknown(false);

const connectionVerificationSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required()
}).unknown(false);

const hydrationRunCreateSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().greater(Joi.ref('from')).required(),
  maxPages: Joi.number().integer().min(1).max(50).default(10)
}).unknown(false);

const incrementalRunCreateSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().greater(Joi.ref('from')).required(),
  maxPages: Joi.number().integer().min(1).max(50).default(10),
  overlapMinutes: Joi.number().integer().min(0).max(1440).default(5)
}).unknown(false);

const reconciliationRunCreateSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().greater(Joi.ref('from')).required(),
  maxPages: Joi.number().integer().min(1).max(50).default(10)
}).unknown(false);

const bookingActivationSchema = Joi.object({
  requestId: Joi.string().guid({ version: ['uuidv4'] }).required(),
  previewToken: Joi.string().hex().length(64).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
  acknowledgeNonRetroactive: Joi.boolean().valid(true).required()
}).unknown(false);

const canonicalBookingListSchema = Joi.object({
  ...pagination,
  status: Joi.string().trim().uppercase().valid('ALL', ...CANONICAL_BOOKING_STATUSES).default('ALL'),
  locationId: Joi.number().integer().positive(),
  connectionId: Joi.number().integer().positive(),
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from'))
}).and('from', 'to').unknown(false);

module.exports = {
  connectionCreateSchema,
  connectionUpdateSchema,
  connectionListSchema,
  connectionScopeSchema,
  locationCreateSchema,
  locationUpdateSchema,
  locationAreaLinkSchema,
  authorityPolicyCreateSchema,
  authorityPolicyActivateSchema,
  authorityPolicyListSchema,
  jobListSchema,
  syncStreamListSchema,
  integrationOperationCommandSchema,
  integrationOperationAuditListSchema,
  outboxListSchema,
  credentialUpsertSchema,
  webhookEndpointCreateSchema,
  webhookEndpointLifecycleSchema,
  compatibilityBackfillIssueListSchema,
  projectionIssueListSchema,
  projectionIssueResolveSchema,
  configurationAuthorityListSchema,
  configurationAuthorityPrepareSchema,
  configurationAuthorityActivateSchema,
  configurationAuthorityRollbackSchema,
  customerProfileBackfillApplySchema,
  wineClubProgramCreateSchema,
  wineClubProgramListSchema,
  wineClubMembershipListSchema,
  salesOrderListSchema,
  businessEntityLinkListSchema,
  businessEntityLinkCreateSchema,
  businessEntityLinkCommandSchema,
  customerRollupRebuildSchema,
  customerRollupRunListSchema,
  productVariantCreateSchema,
  productVariantListSchema,
  stockLocationCreateSchema,
  stockLocationListSchema,
  inventoryPositionListSchema,
  inventoryPositionDetailSchema,
  inventoryCommitmentListSchema,
  inventoryAvailabilitySchema,
  inventoryDemandMappingUpsertSchema,
  inventoryDemandMappingListSchema,
  shipmentListSchema,
  staffIdentityUpsertSchema,
  staffIdentityListSchema,
  roleSkillDefinitionUpsertSchema,
  roleSkillDefinitionListSchema,
  staffRoleSkillUpsertSchema,
  rosterShiftListSchema,
  staffAvailabilityListSchema,
  workforceDemandMappingUpsertSchema,
  workforceDemandMappingListSchema,
  bookingCoverageSchema,
  messageDeliveryListSchema,
  intelligenceFactListSchema,
  intelligenceFactMaterializeSchema,
  intelligenceFactRunListSchema,
  customerRelationshipContextSchema,
  clubFulfilmentContextSchema,
  areaCapacityContextSchema,
  integrationHealthSchema,
  domainActivationPreviewSchema,
  domainActivationSchema,
  domainActivationDisableSchema,
  connectionVerificationSchema,
  hydrationRunCreateSchema,
  incrementalRunCreateSchema,
  reconciliationRunCreateSchema,
  bookingActivationSchema,
  canonicalBookingListSchema
};
