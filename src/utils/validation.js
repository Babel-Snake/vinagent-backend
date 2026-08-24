const Joi = require('joi');
const {
    RESOLVED_AS,
    RESOLUTION_TYPES,
    CUSTOMER_OUTCOMES
} = require('./taskOutcome');

const validate = (schema, data) => {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const message = error.details.map(d => d.message).join(', ');
        const err = new Error(message);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
    }

    return value;
};

// --- CONSTANTS ---
const CATEGORIES = ['BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'OPERATIONS', 'INTERNAL', 'SYSTEM'];
const STATUSES = ['PENDING', 'ACTIONED', 'REJECTED'];
const PRIORITIES = ['low', 'normal', 'high'];
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
const CUSTOMER_TYPES = ['MEMBER', 'VISITOR', 'UNKNOWN'];
const CHANNELS = ['sms', 'email', 'voice', 'none'];
const TASK_ORIGINS = ['INTERNAL', 'EXTERNAL'];
const INBOUND_METHODS = ['internal', 'email', 'phone', 'sms', 'in_person', 'other'];
const WORKFLOW_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED'];
const WAITING_ON = ['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'];
const STEP_TYPES = ['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'];
const STEP_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED'];
const STEP_SUGGESTION_STATUSES = ['DRAFT', 'SAVED', 'SENT', 'ACTIONED', 'FAILED'];
const NOTICE_CATEGORIES = [
    'GENERAL',
    'WINE',
    'VINTAGE_CHANGE',
    'PRICING',
    'STOCK',
    'CUSTOMERS',
    'MAINTENANCE',
    'EVENTS',
    'STAFF',
    'WINE_CLUB',
    'URGENT'
];
const NOTICE_PRIORITIES = ['normal', 'important', 'urgent'];
const NOTICE_AUDIENCE_TYPES = ['all_staff', 'roles', 'users'];
const NOTICE_AUDIENCE_ROLES = ['staff', 'manager', 'admin'];
const ATTACHMENT_ENTITY_TYPES = ['TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE', 'PROJECT'];
const OPERATIONAL_ITEM_TYPES = ['TASK', 'NOTICE', 'REQUEST', 'NOTE'];
const OPERATIONAL_SOURCE_TYPES = ['MANUAL', 'INTEGRATION', 'AI'];
const OPERATIONAL_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const OPERATIONAL_INTELLIGENCE_SIGNAL_TYPES = [
    'REQUEST_AGING',
    'RECURRENCE',
    'CLASSIFICATION_CORRECTION',
    'CONVERSION_OUTCOME',
    'NOTICE_ACKNOWLEDGEMENT',
    'TREND'
];
const OPERATIONAL_INTELLIGENCE_SIGNAL_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_CREATED'];
const OPERATIONAL_INTELLIGENCE_SIGNAL_SEVERITIES = ['info', 'warning', 'critical'];
const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const PROJECT_HEALTH_STATES = ['ON_TRACK', 'AT_RISK', 'BLOCKED', 'OVERDUE'];
const PROJECT_ITEM_TYPES = ['TASK', 'REQUEST', 'NOTICE', 'NOTE', 'CALENDAR_EVENT'];
const PROJECT_PARTICIPATION_ROLES = ['PARTICIPANT', 'STAKEHOLDER'];

const emailSchema = () => Joi.string().email({ tlds: { allow: false } });

const taskStepSuggestionFields = {
    suggestedReplyBody: Joi.string().max(4000).allow('', null),
    suggestedReplySubject: Joi.string().max(200).allow('', null),
    suggestedChannel: Joi.string().valid(...CHANNELS).allow(null),
    suggestedAction: Joi.string().max(4000).allow('', null),
    suggestedRecipientEmail: emailSchema().allow('', null),
    suggestedCc: Joi.string().max(1000).allow('', null),
    suggestionStatus: Joi.string().valid(...STEP_SUGGESTION_STATUSES).allow(null),
    suggestionGeneratedAt: Joi.date().iso().allow(null),
    suggestionError: Joi.string().max(2000).allow('', null)
};

// --- PAYLOAD SUB-SCHEMAS (Whitelisted Fields) ---
const addressPayloadSchema = Joi.object({
    addressLine1: Joi.string().max(200),
    addressLine2: Joi.string().max(200).allow(''),
    suburb: Joi.string().max(100),
    state: Joi.string().max(50),
    postcode: Joi.string().max(20),
    country: Joi.string().max(50).default('Australia'),
    originalText: Joi.string().max(2000)
}).unknown(false); // Reject unknown fields in address

const bookingPayloadSchema = Joi.object({
    date: Joi.string().isoDate(),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/),
    pax: Joi.number().integer().min(1).max(100),
    experienceType: Joi.string().max(100),
    specialRequests: Joi.string().max(500),
    originalText: Joi.string().max(2000)
}).unknown(false);

// Generic payload for other task types - still controlled
const genericPayloadSchema = Joi.object({
    summary: Joi.string().max(500),
    originalText: Joi.string().max(2000),
    note: Joi.string().max(2000)
}).unknown(true); // Allow extra fields for flexibility

const automationTemplateInstallSchema = Joi.object({
    name: Joi.string().trim().min(1).max(160),
    assigneeId: Joi.number().integer().positive().required(),
    areaId: Joi.number().integer().positive().required(),
    leadTimeMinutes: Joi.number().integer().min(60).max(43200).default(2880),
    responseMinutes: Joi.number().integer().min(15).max(10080)
}).unknown(false);

const taskStepCreateSchema = Joi.object({
    title: Joi.string().required().max(200),
    description: Joi.string().max(4000).allow('', null),
    stepType: Joi.string().valid(...STEP_TYPES).default('INTERNAL'),
    status: Joi.string().valid(...STEP_STATUSES).default('PENDING'),
    waitingOn: Joi.string().valid(...WAITING_ON).default('NONE'),
    ownerUserId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    sortOrder: Joi.number().integer().min(0).optional(),
    blockedReason: Joi.string().max(2000).allow('', null),
    completionNotes: Joi.string().max(2000).allow('', null),
    metadata: Joi.object().unknown(true).optional(),
    ...taskStepSuggestionFields
});

const taskStepUpdateSchema = Joi.object({
    title: Joi.string().max(200),
    description: Joi.string().max(4000).allow('', null),
    stepType: Joi.string().valid(...STEP_TYPES),
    status: Joi.string().valid(...STEP_STATUSES),
    waitingOn: Joi.string().valid(...WAITING_ON),
    ownerUserId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    sortOrder: Joi.number().integer().min(0),
    blockedReason: Joi.string().max(2000).allow('', null),
    completionNotes: Joi.string().max(2000).allow('', null),
    metadata: Joi.object().unknown(true).optional(),
    ...taskStepSuggestionFields
}).min(1);

const taskStepGenerateSuggestionSchema = Joi.object({
    force: Joi.boolean().default(true)
});

const taskStepReorderSchema = Joi.object({
    stepIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(50).required()
});

const taskStepActionSuggestionSchema = Joi.object({
    suggestedReplyBody: Joi.string().max(4000).allow('', null),
    suggestedReplySubject: Joi.string().max(200).allow('', null),
    suggestedChannel: Joi.string().valid(...CHANNELS).allow(null),
    suggestedAction: Joi.string().max(4000).allow('', null),
    suggestedRecipientEmail: emailSchema().allow('', null),
    suggestedCc: Joi.string().max(1000).allow('', null),
    completeStep: Joi.boolean().default(true),
    completionNotes: Joi.string().max(2000).allow('', null)
});

// --- STATUS TRANSITION RULES ---
// Flexible transitions to support manager workflow via status dropdown
const VALID_STATUS_TRANSITIONS = {
    'PENDING': ['ACTIONED', 'REJECTED'],
    'ACTIONED': ['PENDING'], // Can reopen
    'REJECTED': ['PENDING'], // Can reopen
};

function validateStatusTransition(currentStatus, newStatus) {
    if (!newStatus || newStatus === currentStatus) return true;
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
}

// --- MAIN SCHEMAS ---

const createTaskSchema = Joi.object({
    category: Joi.string().valid(...CATEGORIES).required(),
    subType: Joi.string().required().max(50),
    customerType: Joi.string().valid(...CUSTOMER_TYPES).default('UNKNOWN'),
    taskOrigin: Joi.string().valid(...TASK_ORIGINS).optional(),
    inboundMethod: Joi.string().valid(...INBOUND_METHODS).optional(),
    requesterName: Joi.string().max(200).allow('', null),
    requesterEmail: emailSchema().allow('', null),
    requesterPhone: Joi.string().max(30).allow('', null),
    priority: Joi.string().valid(...PRIORITIES).default('normal'),
    sentiment: Joi.string().valid(...SENTIMENTS).default('NEUTRAL'),
    payload: Joi.alternatives().try(
        addressPayloadSchema,
        bookingPayloadSchema,
        genericPayloadSchema
    ).default({}),
    notes: Joi.string().max(2000).optional(),
    memberId: Joi.number().integer().positive().allow(null),
    messageId: Joi.number().integer().positive().allow(null),
    assigneeId: Joi.number().integer().positive().allow(null),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS').default('ORGANISATION'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20).default([]),
    parentTaskId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    resolutionSummary: Joi.string().max(2000).allow('', null),
    resolvedAs: Joi.string().valid(...RESOLVED_AS).allow(null),
    resolutionType: Joi.string().valid(...RESOLUTION_TYPES).allow(null),
    customerOutcome: Joi.string().valid(...CUSTOMER_OUTCOMES).allow(null),
    followUpRequired: Joi.boolean().default(false),
    followUpDueAt: Joi.date().iso().allow(null),
    followUpSummary: Joi.string().max(2000).allow('', null),
    steps: Joi.array().items(taskStepCreateSchema).max(20).optional(),
    calendarEventIds: Joi.array().items(Joi.number().integer().positive()).max(50).default([]),
    // Suggested Reply Fields
    suggestedReplyBody: Joi.string().max(2000).allow(''),
    suggestedChannel: Joi.string().valid(...CHANNELS),
    suggestedReplySubject: Joi.string().max(200).allow('', null),
    suggestedAction: Joi.string().max(4000).allow('', null),
    suggestedRecipientEmail: emailSchema().allow('', null),
    suggestedCc: Joi.string().max(1000).allow('', null),
    isPrivateNote: Joi.boolean().default(false)
}).custom((value, helpers) => {
    if (value.taskOrigin === 'EXTERNAL') {
        if (!value.inboundMethod || value.inboundMethod === 'internal') {
            return helpers.message('External tasks require a valid inbound method.');
        }

        const hasContact = Boolean(value.memberId || value.requesterName || value.requesterEmail || value.requesterPhone);
        if (!hasContact) {
            return helpers.message('External tasks require a linked member or at least one requester contact detail.');
        }
    }

    if (value.taskOrigin === 'INTERNAL' && !value.inboundMethod) {
        value.inboundMethod = 'internal';
    }

    return value;
}, 'manual task intake validation');

const updateTaskNoteSchema = Joi.object({
    isPrivate: Joi.boolean().required()
});

const updateTaskSchema = Joi.object({
    status: Joi.string().valid(...STATUSES),
    priority: Joi.string().valid(...PRIORITIES),
    category: Joi.string().valid(...CATEGORIES),
    subType: Joi.string().max(50),
    sentiment: Joi.string().valid(...SENTIMENTS),
    memberId: Joi.number().integer().positive().allow(null),
    payload: Joi.alternatives().try(
        addressPayloadSchema,
        bookingPayloadSchema,
        genericPayloadSchema
    ),
    notes: Joi.string().max(2000).allow(''),
    suggestedReplyBody: Joi.string().max(2000).allow(''),
    suggestedChannel: Joi.string().valid(...CHANNELS),
    suggestedReplySubject: Joi.string().max(200).allow('', null),
    suggestedAction: Joi.string().max(4000).allow('', null),
    suggestedRecipientEmail: emailSchema().allow('', null),
    suggestedCc: Joi.string().max(1000).allow('', null),
    assigneeId: Joi.number().integer().positive().allow(null),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20),
    parentTaskId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    resolutionSummary: Joi.string().max(2000).allow('', null),
    resolvedAs: Joi.string().valid(...RESOLVED_AS).allow(null),
    resolutionType: Joi.string().valid(...RESOLUTION_TYPES).allow(null),
    customerOutcome: Joi.string().valid(...CUSTOMER_OUTCOMES).allow(null),
    followUpRequired: Joi.boolean(),
    followUpDueAt: Joi.date().iso().allow(null),
    followUpSummary: Joi.string().max(2000).allow('', null),
    regenerateSuggestedReply: Joi.boolean(),
    isPrivateNote: Joi.boolean()
}).min(1);

const createNoticeSchema = Joi.object({
    title: Joi.string().trim().required().min(1).max(200),
    body: Joi.string().trim().required().min(1).max(10000),
    category: Joi.string().valid(...NOTICE_CATEGORIES).default('GENERAL'),
    priority: Joi.string().valid(...NOTICE_PRIORITIES).default('normal'),
    isPinned: Joi.boolean().default(false),
    requiresAcknowledgement: Joi.boolean().default(false),
    acknowledgementDueAt: Joi.date().iso().allow(null),
    audienceType: Joi.string().valid(...NOTICE_AUDIENCE_TYPES).default('all_staff'),
    audienceRoles: Joi.array().items(Joi.string().valid(...NOTICE_AUDIENCE_ROLES)).max(10).default([]),
    audienceUserIds: Joi.array().items(Joi.number().integer().positive()).max(100).default([]),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS').default('ORGANISATION'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20).default([]),
    calendarEventIds: Joi.array().items(Joi.number().integer().positive()).max(50).default([]),
    effectiveFrom: Joi.date().iso().allow(null),
    expiresAt: Joi.date().iso().allow(null)
}).custom((value, helpers) => {
    if (value.effectiveFrom && value.expiresAt) {
        const effectiveFrom = new Date(value.effectiveFrom).getTime();
        const expiresAt = new Date(value.expiresAt).getTime();
        if (expiresAt < effectiveFrom) {
            return helpers.message('Expiry date must be after the effective date.');
        }
    }
    if (value.acknowledgementDueAt && !value.requiresAcknowledgement) {
        return helpers.message('Acknowledgement due date requires acknowledgement tracking.');
    }
    return value;
}, 'notice date validation');

const updateNoticeSchema = Joi.object({
    title: Joi.string().trim().min(1).max(200),
    body: Joi.string().trim().min(1).max(10000),
    category: Joi.string().valid(...NOTICE_CATEGORIES),
    priority: Joi.string().valid(...NOTICE_PRIORITIES),
    isPinned: Joi.boolean(),
    requiresAcknowledgement: Joi.boolean(),
    acknowledgementDueAt: Joi.date().iso().allow(null),
    audienceType: Joi.string().valid(...NOTICE_AUDIENCE_TYPES),
    audienceRoles: Joi.array().items(Joi.string().valid(...NOTICE_AUDIENCE_ROLES)).max(10),
    audienceUserIds: Joi.array().items(Joi.number().integer().positive()).max(100),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20),
    calendarEventIds: Joi.array().items(Joi.number().integer().positive()).max(50),
    effectiveFrom: Joi.date().iso().allow(null),
    expiresAt: Joi.date().iso().allow(null),
    isArchived: Joi.boolean()
}).min(1).custom((value, helpers) => {
    if (value.effectiveFrom && value.expiresAt) {
        const effectiveFrom = new Date(value.effectiveFrom).getTime();
        const expiresAt = new Date(value.expiresAt).getTime();
        if (expiresAt < effectiveFrom) {
            return helpers.message('Expiry date must be after the effective date.');
        }
    }
    return value;
}, 'notice date validation');

const noticeTaskLinkSchema = Joi.object({
    taskId: Joi.number().integer().positive().required()
});

const noticeCommentCreateSchema = Joi.object({
    body: Joi.string().trim().required().min(1).max(4000),
    parentCommentId: Joi.number().integer().positive().allow(null)
});

const taskNoticeLinkSchema = Joi.object({
    noticeId: Joi.number().integer().positive().required()
});

const attachmentUploadSchema = Joi.object({
    entityType: Joi.string().valid(...ATTACHMENT_ENTITY_TYPES).required(),
    entityId: Joi.number().integer().positive().required(),
    filename: Joi.string().trim().min(1).max(255).required(),
    mimeType: Joi.string().trim().min(1).max(120).required(),
    sizeBytes: Joi.number().integer().min(1).optional(),
    contentBase64: Joi.string().required()
});

const attachmentListSchema = Joi.object({
    entityType: Joi.string().valid(...ATTACHMENT_ENTITY_TYPES).required(),
    entityId: Joi.number().integer().positive().required()
});

const autoclassifySchema = Joi.object({
    text: Joi.string().required().min(1).max(5000),
    memberId: Joi.number().integer().positive().optional(),
    taskOrigin: Joi.string().valid(...TASK_ORIGINS).optional(),
    inboundMethod: Joi.string().valid(...INBOUND_METHODS).optional(),
    requesterName: Joi.string().max(200).allow('', null),
    requesterEmail: emailSchema().allow('', null),
    requesterPhone: Joi.string().max(30).allow('', null),
    suggestedChannel: Joi.string().valid(...CHANNELS).optional()
});

const smsWebhookSchema = Joi.object({
    From: Joi.string().required(),
    To: Joi.string().required(),
    Body: Joi.string().allow('').optional(),
    MessageSid: Joi.string().required()
}).unknown(true);

const emailWebhookSchema = Joi.object({
    from: emailSchema().required(),
    to: emailSchema().required(),
    subject: Joi.string().allow('').default(''),
    text: Joi.string().allow('').default(''),
    html: Joi.string().allow('').optional(),
    messageId: Joi.string().required()
}).unknown(true);

const voiceWebhookSchema = Joi.object({
    From: Joi.string().required(),
    To: Joi.string().required(),
    CallSid: Joi.string().required(),
    RecordingUrl: Joi.string().uri().allow('', null),
    TranscriptionText: Joi.string().allow('').optional()
}).unknown(true);

// --- WINERY CONFIG SCHEMAS ---

const wineryBrandSchema = Joi.object({
    brandStoryShort: Joi.string().max(5000).allow(''),
    tonePreset: Joi.string().valid('warm', 'premium', 'playful', 'rustic', 'formal'),
    voiceGuidelines: Joi.string().max(5000).allow(''),
    doSayExamples: Joi.array().items(Joi.string()).optional(),
    dontSayExamples: Joi.array().items(Joi.string()).optional(),
    signOffDefault: Joi.string().max(200).allow(''),
    spellingLocale: Joi.string().max(10).default('AU'),
    emojisAllowed: Joi.boolean(),
    formalityLevel: Joi.number().integer().min(1).max(5),
    readingLevel: Joi.string().max(50)
});

const wineryBookingsSchema = Joi.object({
    walkInsAllowed: Joi.boolean(),
    walkInNotes: Joi.string().max(1000).allow(''),
    groupBookingThreshold: Joi.number().integer().min(1),
    leadTimeHours: Joi.number().min(0),
    cancellationPolicyText: Joi.string().max(2000).allow(''),
    kidsPolicy: Joi.string().max(1000).allow(''),
    petsPolicy: Joi.string().max(1000).allow(''),
    defaultResponseStrategy: Joi.string().valid('confirm', 'create_task')
});

const wineryPolicySchema = Joi.object({
    shippingTimeframesText: Joi.string().max(1000).allow(''),
    shippingRegions: Joi.array().items(Joi.string()).optional(),
    returnsRefundsPolicyText: Joi.string().max(2000).allow(''),
    wineClubSummary: Joi.string().max(2000).allow(''),
    accessibilityNotes: Joi.string().max(1000).allow(''),
    eventPolicy: Joi.string().max(2000).allow('')
});

const wineryFaqSchema = Joi.object({
    areaId: Joi.number().integer().positive().allow(null),
    question: Joi.string().trim().required().max(500),
    answer: Joi.string().trim().required().max(10000),
    tags: Joi.array().items(Joi.string().trim().max(100)).max(50).default([]),
    isActive: Joi.boolean().default(true)
});

const wineryFaqUpdateSchema = Joi.object({
    question: Joi.string().trim().max(500),
    answer: Joi.string().trim().max(10000),
    tags: Joi.array().items(Joi.string().trim().max(100)).max(50),
    isActive: Joi.boolean()
}).min(1);

const winerySopSchema = Joi.object({
    areaId: Joi.number().integer().positive().allow(null),
    title: Joi.string().required().max(200),
    body: Joi.string().required().max(5000),
    isActive: Joi.boolean().default(true)
});

const winerySopUpdateSchema = Joi.object({
    title: Joi.string().max(200),
    body: Joi.string().max(5000),
    isActive: Joi.boolean()
}).min(1);

const operationalAreaProfileSchema = Joi.object({
    publicEmail: Joi.string().email().max(254).allow('', null),
    publicPhone: Joi.string().max(100).allow('', null),
    openingHoursText: Joi.string().max(2000).allow('', null),
    guestDirections: Joi.string().max(2000).allow('', null),
    serviceNotes: Joi.string().max(5000).allow('', null)
});

const areaProductListingSchema = Joi.object({
    isAvailable: Joi.boolean(),
    priceOverride: Joi.number().precision(2).min(0).allow(null),
    stockStatusOverride: Joi.string().valid('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK').allow(null),
    isFeatured: Joi.boolean(),
    salesNotes: Joi.string().max(5000).allow('', null)
});

const INTEGRATION_DOMAINS = ['sms', 'email', 'pos', 'crm', 'booking', 'delivery'];
const AREA_INTEGRATION_DOMAINS = ['pos', 'crm', 'booking', 'delivery'];
const INTEGRATION_STATUSES = ['not_connected', 'connected', 'error', 'needs_reauth'];
const INTEGRATION_AUTH_METHODS = ['none', 'api_key', 'oauth', 'webhook', 'manual'];
const INTEGRATION_EVENT_TYPES = [
    'call.intake',
    'notice.imported',
    'task.suggested',
    'message.imported',
    'file.imported',
    'unknown.received'
];
const CANONICAL_INTEGRATION_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const INTEGRATION_EVENT_STATUSES = [
    'RECEIVED',
    'NORMALIZED',
    'PENDING_REVIEW',
    'PROCESSED',
    'IGNORED',
    'ARCHIVED',
    'FAILED',
    'DUPLICATE'
];
const INTEGRATION_INTAKE_METHODS = ['webhook', 'api', 'automation', 'email', 'manual', 'import', 'provider_adapter'];
const INTEGRATION_REVIEW_ACTIONS = ['publish_notice', 'create_task', 'link_task', 'create_items', 'ignore', 'archive'];

const providerConnectionSchema = Joi.object({
    provider: Joi.string().max(100).allow('', null),
    executionProvider: Joi.string().max(100).allow('', null),
    liveAdapterAvailable: Joi.boolean().default(false),
    status: Joi.string().valid(...INTEGRATION_STATUSES).default('not_connected'),
    authMethod: Joi.string().valid(...INTEGRATION_AUTH_METHODS).default('none'),
    externalAccountId: Joi.string().max(200).allow('', null),
    externalLocationId: Joi.string().max(200).allow('', null),
    baseUrl: Joi.string().max(500).allow('', null),
    webhookUrl: Joi.string().max(500).allow('', null),
    webhookSigningConfigured: Joi.boolean().default(false),
    webhookSecret: Joi.string().min(16).max(500).allow('', null),
    clearWebhookSecret: Joi.boolean().default(false),
    webhookSecretLastRotatedAt: Joi.date().iso().allow(null),
    capabilities: Joi.array().items(Joi.string().max(100)).default([]),
    lastTestedAt: Joi.date().iso().allow(null),
    lastError: Joi.string().max(1000).allow('', null),
    notes: Joi.string().max(2000).allow('', null)
}).unknown(false);

const wineryIntegrationSchema = Joi.object({
    smsProvider: Joi.string().valid('twilio', 'messagemedia', 'other').default('twilio'),
    smsFromNumber: Joi.string().max(20).allow(''),
    emailProvider: Joi.string().valid('sendgrid', 'outlook', 'mailgun', 'ses', 'other').default('sendgrid'),
    emailFromAddress: emailSchema().allow(''),
    channelsEnabled: Joi.array().items(Joi.string()).optional(),
    kioskModeEnabled: Joi.boolean(),
    posProvider: Joi.string().valid('square', 'shopify', 'vend', 'lightspeed', 'other').default('other'),
    crmProvider: Joi.string().valid('commerce7', 'winedirect', 'ecellar', 'other').default('other'),
    bookingProvider: Joi.string().valid('sevenrooms', 'resy', 'opentable', 'nowbookit', 'other').default('other'),
    deliveryProvider: Joi.string().valid('auspost', 'shippit', 'startrack', 'other').default('other'),
    providerConnections: Joi.object()
        .pattern(Joi.string().valid(...INTEGRATION_DOMAINS), providerConnectionSchema)
        .unknown(false)
        .default({})
    // planTier excluded for security (admin only via billing)
});

const wineryIntegrationTestSchema = Joi.object({
    domain: Joi.string().valid(...INTEGRATION_DOMAINS).required()
});

const areaIntegrationConfigSchema = Joi.object({
    providerConnections: Joi.object()
        .pattern(Joi.string().valid(...AREA_INTEGRATION_DOMAINS), providerConnectionSchema)
        .unknown(false)
        .min(1)
        .required()
});

const areaIntegrationTestSchema = Joi.object({
    domain: Joi.string().valid(...AREA_INTEGRATION_DOMAINS).required()
});

const emailSyncSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional()
});

const integrationEventCreateSchema = Joi.object({
    provider: Joi.string().trim().min(1).max(100).required(),
    intakeMethod: Joi.string().valid(...INTEGRATION_INTAKE_METHODS).default('manual'),
    eventType: Joi.string().lowercase().max(120).pattern(CANONICAL_INTEGRATION_EVENT_TYPE_PATTERN).required(),
    externalEventId: Joi.string().trim().max(255).allow('', null),
    rawPayload: Joi.object().unknown(true).default({}),
    normalizedPayload: Joi.object().unknown(true).optional(),
    metadata: Joi.object().unknown(true).optional(),
    receivedAt: Joi.date().iso().allow(null),
    suggestedAreaId: Joi.number().integer().positive().allow(null),
    areaConfidence: Joi.number().min(0).max(1).allow(null),
    areaMappingSource: Joi.string().valid('RULE', 'MANUAL', 'ADAPTER', 'AI', 'DEFAULT').allow(null)
});

const integrationEventListSchema = Joi.object({
    status: Joi.string().valid(...INTEGRATION_EVENT_STATUSES, 'all').default('all'),
    eventType: Joi.alternatives().try(
        Joi.string().valid('all'),
        Joi.string().lowercase().max(120).pattern(CANONICAL_INTEGRATION_EVENT_TYPE_PATTERN)
    ).default('all'),
    provider: Joi.string().trim().max(100).allow('all').default('all'),
    areaId: Joi.alternatives().try(Joi.number().integer().positive(), Joi.string().valid('all')).default('all'),
    search: Joi.string().trim().max(200).allow('', null),
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional()
});

const integrationEventReviewSchema = Joi.object({
    action: Joi.string().valid(...INTEGRATION_REVIEW_ACTIONS).required(),
    reason: Joi.string().trim().max(1000).allow('', null),
    taskId: Joi.number().integer().positive().optional(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(50).default([]),
    confirmedAreaId: Joi.number().integer().positive().allow(null),
    items: Joi.array().items(Joi.object({
        key: Joi.string().trim().min(1).max(100).optional(),
        type: Joi.string().valid('TASK', 'NOTICE', 'REQUEST', 'NOTE').required(),
        mode: Joi.string().valid('CREATE', 'LINK').default('CREATE'),
        itemId: Joi.number().integer().positive().optional(),
        data: Joi.object().unknown(true).default({})
    }).unknown(false)).max(10).default([]),
    notice: Joi.object({
        title: Joi.string().trim().max(200),
        body: Joi.string().trim().max(10000),
        category: Joi.string().valid(...NOTICE_CATEGORIES),
        priority: Joi.string().valid(...NOTICE_PRIORITIES),
        isPinned: Joi.boolean(),
        requiresAcknowledgement: Joi.boolean(),
        acknowledgementDueAt: Joi.date().iso().allow(null),
        audienceType: Joi.string().valid(...NOTICE_AUDIENCE_TYPES),
        audienceRoles: Joi.array().items(Joi.string().valid(...NOTICE_AUDIENCE_ROLES)).max(10),
        audienceUserIds: Joi.array().items(Joi.number().integer().positive()).max(100),
        areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
        primaryAreaId: Joi.number().integer().positive().allow(null),
        linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20),
        effectiveFrom: Joi.date().iso().allow(null),
        expiresAt: Joi.date().iso().allow(null)
    }).unknown(false).default({}),
    task: Joi.object({
        requesterName: Joi.string().max(200).allow('', null),
        requesterPhone: Joi.string().max(30).allow('', null),
        category: Joi.string().valid(...CATEGORIES),
        subType: Joi.string().max(50),
        priority: Joi.string().valid(...PRIORITIES),
        dueAt: Joi.date().iso().allow(null),
        suggestedAction: Joi.string().max(4000).allow('', null),
        areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
        primaryAreaId: Joi.number().integer().positive().allow(null),
        linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).max(20),
        steps: Joi.array().items(taskStepCreateSchema).max(20)
    }).unknown(false).default({})
}).custom((value, helpers) => {
    if (value.action === 'link_task' && !value.taskId) {
        return helpers.message('A taskId is required when linking an event to an existing task.');
    }
    if (value.action === 'create_items') {
        if (!value.items.length) return helpers.message('At least one item is required for batch creation.');
        const keys = value.items.map((item, index) => item.key || `item-${index + 1}`);
        if (new Set(keys).size !== keys.length) return helpers.message('Batch item keys must be unique.');
        if (value.items.some(item => item.mode === 'LINK' && !item.itemId)) {
            return helpers.message('An itemId is required for each linked batch item.');
        }
    }
    return value;
}, 'integration event review validation');

const automationDefinitionSchema = Joi.object().unknown(true).required();

const automationRuleCreateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(160).required(),
    description: Joi.string().trim().max(4000).allow('', null),
    areaId: Joi.number().integer().positive().allow(null),
    definition: automationDefinitionSchema
}).unknown(false);

const automationRuleUpdateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(160),
    description: Joi.string().trim().max(4000).allow('', null),
    areaId: Joi.number().integer().positive().allow(null),
    definition: automationDefinitionSchema
}).min(1).unknown(false);

const automationRuleStatusSchema = Joi.object({
    status: Joi.string().uppercase().valid('DRAFT', 'ACTIVE', 'PAUSED').required()
}).unknown(false);

const automationSampleEventSchema = Joi.object({
    provider: Joi.string().trim().max(100).default('manual'),
    intakeMethod: Joi.string().trim().max(50).default('automation'),
    eventType: Joi.string().lowercase().max(120).pattern(CANONICAL_INTEGRATION_EVENT_TYPE_PATTERN).required(),
    externalEventId: Joi.string().trim().max(255).allow('', null),
    normalizedPayload: Joi.object().unknown(true).default({}),
    metadata: Joi.object().unknown(true).default({}),
    suggestedAreaId: Joi.number().integer().positive().allow(null),
    confirmedAreaId: Joi.number().integer().positive().allow(null),
    receivedAt: Joi.date().iso().default(() => new Date())
}).unknown(false);

const automationRuleEvaluateSchema = Joi.object({
    sourceEventId: Joi.number().integer().positive(),
    sampleEvent: automationSampleEventSchema,
    sourceKey: Joi.string().trim().max(255)
}).xor('sourceEventId', 'sampleEvent').unknown(false);

const automationRuleListSchema = Joi.object({
    status: Joi.string().valid('all', 'DRAFT', 'ACTIVE', 'PAUSED').default('all'),
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional()
}).unknown(false);

const automationRunListSchema = Joi.object({
    ruleId: Joi.number().integer().positive(),
    status: Joi.string().valid('all', 'RUNNING', 'NOT_MATCHED', 'ACTIONED', 'SKIPPED', 'FAILED').default('all'),
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional()
}).unknown(false);

const automationBindingListSchema = Joi.object({
    ruleId: Joi.number().integer().positive(),
    resourceType: Joi.string().trim().uppercase().max(120),
    resourceId: Joi.number().integer().positive(),
    lifecycleState: Joi.string().trim().uppercase().valid('ACTIVE', 'HUMAN_OWNED', 'CANCELLED', 'ORPHANED'),
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional()
}).unknown(false);

const automationCapabilityListSchema = Joi.object({
    areaId: Joi.number().integer().positive().allow(null)
}).unknown(false);

const operationalIntelligenceConfigSchema = Joi.object({
    preset: Joi.string().valid('default', 'sensitive', 'conservative').optional(),
    scheduler: Joi.object({
        enabled: Joi.boolean().optional(),
        period: Joi.string().valid('day', 'week', 'month', 'year').optional(),
        offset: Joi.number().integer().min(0).max(52).optional()
    }).optional(),
    thresholds: Joi.object({
        requestAgingOverdueCount: Joi.number().integer().min(0).max(1000).optional(),
        requestAgingOverSevenDaysCount: Joi.number().integer().min(0).max(1000).optional(),
        requestAgingAverageAgeHours: Joi.number().integer().min(1).max(1440).optional(),
        classificationMinimumEvaluated: Joi.number().integer().min(1).max(10000).optional(),
        classificationMinimumCorrected: Joi.number().integer().min(1).max(10000).optional(),
        classificationCorrectionRate: Joi.number().integer().min(1).max(100).optional(),
        conversionMinimumTotal: Joi.number().integer().min(1).max(10000).optional(),
        conversionCompletionRate: Joi.number().integer().min(0).max(100).optional(),
        trendMinimumDelta: Joi.number().integer().min(1).max(10000).optional(),
        trendMinimumChangePercent: Joi.number().integer().min(1).max(1000).optional(),
        trendWarningDelta: Joi.number().integer().min(1).max(10000).optional(),
        noticeOutstandingCount: Joi.number().integer().min(1).max(10000).optional()
    }).optional(),
    reminders: Joi.object({
        dueSoonHours: Joi.number().integer().min(1).max(720).optional(),
        overdueRepeatHours: Joi.number().integer().min(1).max(720).optional(),
        batchSize: Joi.number().integer().min(1).max(1000).optional()
    }).optional()
}).min(1);

const operationalIntelligenceConfigPreviewSchema = operationalIntelligenceConfigSchema.keys({
    period: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
    offset: Joi.number().integer().min(0).max(120).default(0),
    historyPeriods: Joi.number().integer().min(1).max(6).default(1),
    start: Joi.date().iso(),
    end: Joi.date().iso().greater(Joi.ref('start'))
}).and('start', 'end').min(1);

const winerySettingsSchema = Joi.object({
    enableBookingModule: Joi.boolean().optional(),
    enableWineClubModule: Joi.boolean().optional(),
    enableOrdersModule: Joi.boolean().optional(),
    enableSecureLinks: Joi.boolean().optional(),
    enableInsights: Joi.boolean().optional(),
    enableVoice: Joi.boolean().optional(),
    identityMatchingConfig: Joi.object({
        autoLinkThreshold: Joi.number().integer().min(100).max(400).default(180),
        reviewThreshold: Joi.number().integer().min(0).max(400).default(120),
        maxReviewCandidates: Joi.number().integer().min(1).max(10).default(3),
        allowPhoneSuffixNameAutoLink: Joi.boolean().default(true),
        allowNameOnlyReview: Joi.boolean().default(true)
    }).optional(),
    authConfig: Joi.object({
        pinLoginEnabled: Joi.boolean().default(false),
        allowManagerBasicPin: Joi.boolean().default(false),
        pinIdleTimeoutSeconds: Joi.number().integer().min(60).max(3600).default(300),
        pinSessionHours: Joi.number().integer().min(1).max(24).default(8),
        pinMaxAttempts: Joi.number().integer().min(3).max(10).default(5),
        pinLockoutMinutes: Joi.number().integer().min(1).max(60).default(5)
    }).optional(),
    operationalIntelligenceConfig: operationalIntelligenceConfigSchema.optional()
}).min(1);

// --- MEMBER SCHEMAS ---

const MEMBER_SOURCES = ['manual', 'sms', 'email', 'booking', 'wine_club', 'pos', 'import', 'website', 'referral', 'walk_in'];
const LOYALTY_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum'];
const CONTACT_METHODS = ['email', 'sms', 'phone', 'any'];
const MEMBER_CUSTOMER_TYPES = ['guest', 'member', 'tour_operator'];

const winePreferencesSchema = Joi.object({
    varietals: Joi.array().items(Joi.string()).optional(),
    styles: Joi.array().items(Joi.string()).optional(),
    priceRange: Joi.object({
        min: Joi.number().min(0),
        max: Joi.number().min(0)
    }).optional(),
    dietaryNotes: Joi.string().max(500).allow('').optional()
}).optional();

const createMemberSchema = Joi.object({
    firstName: Joi.string().required().max(100),
    lastName: Joi.string().required().max(100),
    email: emailSchema().allow('', null),
    phone: Joi.string().max(30).allow('', null),
    addressLine1: Joi.string().max(200).allow('', null),
    addressLine2: Joi.string().max(200).allow('', null),
    suburb: Joi.string().max(100).allow('', null),
    state: Joi.string().max(50).allow('', null),
    postcode: Joi.string().max(20).allow('', null),
    country: Joi.string().max(50).default('Australia'),
    dateOfBirth: Joi.date().iso().allow(null),
    gender: Joi.string().max(20).allow('', null),
    preferredLanguage: Joi.string().max(10).default('en'),
    source: Joi.string().valid(...MEMBER_SOURCES).default('manual'),
    externalRef: Joi.string().max(200).allow('', null),
    winePreferences: winePreferencesSchema,
    lifetimeSpend: Joi.number().min(0).default(0),
    totalOrders: Joi.number().integer().min(0).default(0),
    visitCount: Joi.number().integer().min(0).default(0),
    lastContactAt: Joi.date().iso().allow(null),
    lastVisitAt: Joi.date().iso().allow(null),
    lastPurchaseAt: Joi.date().iso().allow(null),
    customerType: Joi.string().valid(...MEMBER_CUSTOMER_TYPES).default('guest'),
    loyaltyTier: Joi.string().valid(...LOYALTY_TIERS).default('none'),
    isWineClubMember: Joi.boolean().default(false),
    tags: Joi.array().items(Joi.string()).optional(),
    preferredContactMethod: Joi.string().valid(...CONTACT_METHODS).default('any'),
    marketingOptIn: Joi.boolean().default(false),
    notes: Joi.string().max(5000).allow('', null)
});

const updateMemberSchema = createMemberSchema.fork(
    ['firstName', 'lastName'],
    (schema) => schema.optional()
).min(1);

const mergeMemberSchema = Joi.object({
    sourceMemberId: Joi.number().integer().positive().required(),
    fieldOverrides: Joi.object({
        firstName: Joi.string().valid('target', 'source').optional(),
        lastName: Joi.string().valid('target', 'source').optional(),
        email: Joi.string().valid('target', 'source').optional(),
        phone: Joi.string().valid('target', 'source').optional(),
        addressLine1: Joi.string().valid('target', 'source').optional(),
        addressLine2: Joi.string().valid('target', 'source').optional(),
        suburb: Joi.string().valid('target', 'source').optional(),
        state: Joi.string().valid('target', 'source').optional(),
        postcode: Joi.string().valid('target', 'source').optional(),
        country: Joi.string().valid('target', 'source').optional(),
        source: Joi.string().valid('target', 'source').optional(),
        preferredContactMethod: Joi.string().valid('target', 'source').optional(),
        notes: Joi.string().valid('target', 'source', 'combine').optional()
    }).default({})
});

const wineryContactSchema = Joi.object({
    name: Joi.string().required().max(100),
    role: Joi.string().required().max(100),
    email: emailSchema().allow('', null),
    phone: Joi.string().max(30).allow('', null),
    layer: Joi.string().max(50).allow('', null),
    notes: Joi.string().max(1000).allow('', null),
    reportsToId: Joi.number().integer().allow(null).optional(),
    responsibilities: Joi.string().max(2000).allow('', null),
    isActive: Joi.boolean().default(true),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50)
});

const operationalAreaCreateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    description: Joi.string().trim().max(2000).allow('', null),
    isActive: Joi.boolean().default(true),
    sortOrder: Joi.number().integer().min(0).max(10000).default(0)
});

const operationalAreaUpdateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(120),
    description: Joi.string().trim().max(2000).allow('', null),
    isActive: Joi.boolean(),
    sortOrder: Joi.number().integer().min(0).max(10000)
}).min(1);

const areaMembershipReplaceSchema = Joi.object({
    memberships: Joi.array().items(Joi.object({
        areaId: Joi.number().integer().positive().required(),
        membershipRole: Joi.string().valid('MEMBER', 'MANAGER').default('MEMBER'),
        isPrimary: Joi.boolean().default(false)
    }).unknown(false)).max(50).required()
});

const operationalPlacementFields = {
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS').default('ORGANISATION'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50).default([])
};

const operationalAiFields = {
    aiSuggestedType: Joi.string().valid(...OPERATIONAL_ITEM_TYPES).allow(null),
    aiConfidence: Joi.number().min(0).max(1).precision(4).allow(null),
    aiSuggestion: Joi.object().unknown(true).allow(null)
};

const createOperationalRequestSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255).required(),
    body: Joi.string().trim().min(1).max(10000).required(),
    originalText: Joi.string().max(10000).allow('', null),
    subtype: Joi.string().trim().max(100).allow('', null),
    priority: Joi.string().valid(...PRIORITIES).default('normal'),
    dueAt: Joi.date().iso().allow(null),
    requestedFromUserId: Joi.number().integer().positive().allow(null),
    sourceType: Joi.string().valid(...OPERATIONAL_SOURCE_TYPES).default('MANUAL'),
    sourceEventId: Joi.number().integer().positive().allow(null),
    ...operationalPlacementFields,
    ...operationalAiFields
}).unknown(false);

const updateOperationalRequestSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255),
    body: Joi.string().trim().min(1).max(10000),
    subtype: Joi.string().trim().max(100).allow('', null),
    priority: Joi.string().valid(...PRIORITIES),
    dueAt: Joi.date().iso().allow(null),
    requestedFromUserId: Joi.number().integer().positive().allow(null),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50)
}).min(1).unknown(false);

const decideOperationalRequestSchema = Joi.object({
    status: Joi.string().valid('APPROVED', 'REJECTED', 'CANCELLED').required(),
    response: Joi.string().trim().max(5000).allow('', null)
}).unknown(false);

const createOperationalRecordSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255).required(),
    body: Joi.string().trim().min(1).max(10000).required(),
    originalText: Joi.string().max(10000).allow('', null),
    recordType: Joi.string().trim().max(100).allow('', null),
    sourceType: Joi.string().valid(...OPERATIONAL_SOURCE_TYPES).default('MANUAL'),
    sourceReference: Joi.string().trim().max(255).allow('', null),
    occurredAt: Joi.date().iso().allow(null),
    memberId: Joi.number().integer().positive().allow(null),
    sourceEventId: Joi.number().integer().positive().allow(null),
    metadata: Joi.object().unknown(true).allow(null),
    recipientUserIds: Joi.array().items(Joi.number().integer().positive()).unique().max(100).default([]),
    ...operationalPlacementFields,
    ...operationalAiFields
}).unknown(false);

const updateOperationalRecordSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255),
    body: Joi.string().trim().min(1).max(10000),
    recordType: Joi.string().trim().max(100).allow('', null),
    sourceReference: Joi.string().trim().max(255).allow('', null),
    occurredAt: Joi.date().iso().allow(null),
    memberId: Joi.number().integer().positive().allow(null),
    metadata: Joi.object().unknown(true).allow(null),
    recipientUserIds: Joi.array().items(Joi.number().integer().positive()).unique().max(100),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50)
}).min(1).unknown(false);

const operationalItemListSchema = Joi.object({
    page: Joi.number().integer().min(1).max(100000).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(25),
    search: Joi.string().trim().max(200).allow(''),
    areaId: Joi.alternatives().try(
        Joi.string().valid('all', 'organisation'),
        Joi.number().integer().positive()
    ).default('all'),
    status: Joi.string().valid('all', ...OPERATIONAL_REQUEST_STATUSES).default('all'),
    directedToMe: Joi.boolean().default(false)
}).unknown(false);

const operationalItemCommentSchema = Joi.object({
    body: Joi.string().trim().min(1).max(5000).required(),
    parentCommentId: Joi.number().integer().positive().allow(null)
}).unknown(false);

const operationalItemRelationSchema = Joi.object({
    targetType: Joi.string().valid(...OPERATIONAL_ITEM_TYPES).required(),
    targetId: Joi.number().integer().positive().required(),
    relationType: Joi.string().valid(
        'CREATED_FROM', 'RELATES_TO', 'BLOCKS', 'DUPLICATES',
        'GENERATED_TASK', 'FOLLOW_UP_FOR', 'COMPLETION_RECORD'
    ).default('RELATES_TO'),
    metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const operationalItemConversionSchema = Joi.object({
    category: Joi.string().valid(...CATEGORIES).default('INTERNAL'),
    subType: Joi.string().trim().max(100).allow('', null),
    priority: Joi.string().valid(...PRIORITIES).default('normal'),
    assigneeId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    suggestedAction: Joi.string().trim().max(4000).allow('', null)
}).unknown(false);

const operationsFeedQuerySchema = Joi.object({
    types: Joi.string().trim().max(100).custom((value, helpers) => {
        const values = String(value).split(',').map(type => type.trim().toUpperCase()).filter(Boolean);
        if (values.length === 0 || values.some(type => !OPERATIONAL_ITEM_TYPES.includes(type))) {
            return helpers.error('any.only');
        }
        return [...new Set(values)].join(',');
    }).default('TASK,NOTICE,REQUEST,NOTE'),
    search: Joi.string().trim().max(200).allow('').default(''),
    areaId: Joi.alternatives().try(
        Joi.string().valid('all', 'organisation'),
        Joi.number().integer().positive()
    ).default('all'),
    status: Joi.string().trim().uppercase().valid(
        'ALL', 'PENDING', 'ACTIONED', 'REJECTED', 'APPROVED', 'CANCELLED',
        'ACTIVE', 'EXPIRED', 'ARCHIVED', 'RECORDED'
    ).default('ALL'),
    sortBy: Joi.string().valid('newest', 'oldest').default('newest'),
    page: Joi.number().integer().min(1).max(20).default(1),
    pageSize: Joi.number().integer().min(1).max(50).default(25)
}).unknown(false);

const projectCreateSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255).required(),
    intendedOutcome: Joi.string().trim().min(1).max(10000).required(),
    businessContext: Joi.string().trim().max(10000).allow('', null),
    status: Joi.string().valid(...PROJECT_STATUSES).default('PLANNED'),
    ownerUserId: Joi.number().integer().positive().allow(null),
    leadUserId: Joi.number().integer().positive().allow(null),
    plannedStartAt: Joi.date().iso().allow(null),
    targetEndAt: Joi.date().iso().allow(null),
    riskReason: Joi.string().trim().max(5000).allow('', null),
    riskReviewAt: Joi.date().iso().allow(null),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS').default('ORGANISATION'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50).default([]),
    participantUserIds: Joi.array().items(Joi.number().integer().positive()).unique().max(100).default([])
}).unknown(false);

const projectUpdateSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255),
    intendedOutcome: Joi.string().trim().min(1).max(10000),
    businessContext: Joi.string().trim().max(10000).allow('', null),
    status: Joi.string().valid(...PROJECT_STATUSES),
    ownerUserId: Joi.number().integer().positive().allow(null),
    plannedStartAt: Joi.date().iso().allow(null),
    targetEndAt: Joi.date().iso().allow(null),
    riskReason: Joi.string().trim().max(5000).allow('', null),
    riskReviewAt: Joi.date().iso().allow(null),
    areaScope: Joi.string().valid('ORGANISATION', 'AREAS'),
    primaryAreaId: Joi.number().integer().positive().allow(null),
    linkedAreaIds: Joi.array().items(Joi.number().integer().positive()).unique().max(50),
    completionOverride: Joi.boolean().default(false),
    completionReason: Joi.string().trim().max(5000).allow('', null),
    notifyParticipants: Joi.boolean().default(false)
}).min(1).unknown(false);

const projectListSchema = Joi.object({
    status: Joi.string().valid('all', 'open', ...PROJECT_STATUSES).default('all'),
    health: Joi.string().valid('all', ...PROJECT_HEALTH_STATES).default('all'),
    ownerUserId: Joi.alternatives().try(Joi.string().valid('all', 'me'), Joi.number().integer().positive()).default('all'),
    involvement: Joi.string().valid('all', 'me').default('all'),
    areaId: Joi.alternatives().try(Joi.string().valid('all', 'organisation'), Joi.number().integer().positive()).default('all'),
    search: Joi.string().trim().max(200).allow('').default(''),
    targetFrom: Joi.date().iso(),
    targetTo: Joi.date().iso(),
    sortBy: Joi.string().valid('updated', 'target_soonest', 'target_latest', 'created_newest', 'created_oldest').default('updated'),
    page: Joi.number().integer().min(1).max(100000).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(25)
}).unknown(false);

const projectParticipantCreateSchema = Joi.object({
    userId: Joi.number().integer().positive().required(),
    participationRole: Joi.string().valid(...PROJECT_PARTICIPATION_ROLES).default('PARTICIPANT'),
    notificationsEnabled: Joi.boolean().default(true)
}).unknown(false);

const projectParticipantUpdateSchema = Joi.object({
    participationRole: Joi.string().valid(...PROJECT_PARTICIPATION_ROLES),
    notificationsEnabled: Joi.boolean()
}).min(1).unknown(false);

const projectItemCreateSchema = Joi.object({
    itemType: Joi.string().valid(...PROJECT_ITEM_TYPES).required(),
    itemId: Joi.number().integer().positive().required(),
    isRequired: Joi.boolean().default(false),
    isMilestone: Joi.boolean().default(false),
    sortOrder: Joi.number().integer().min(0).default(0)
}).unknown(false);

const projectItemUpdateSchema = Joi.object({
    isRequired: Joi.boolean(),
    isMilestone: Joi.boolean(),
    sortOrder: Joi.number().integer().min(0)
}).min(1).unknown(false);

const projectItemLookupSchema = Joi.object({
    itemType: Joi.string().valid(...PROJECT_ITEM_TYPES).required(),
    itemId: Joi.number().integer().positive().required()
}).unknown(false);

const projectDependencyCreateSchema = Joi.object({
    blockingTaskId: Joi.number().integer().positive().required(),
    blockedTaskId: Joi.number().integer().positive().required()
}).unknown(false);

const projectLeadSchema = Joi.object({
    leadUserId: Joi.number().integer().positive().required()
}).unknown(false);

const projectTaskCreateSchema = Joi.object({
    title: Joi.string().trim().min(1).max(255).required(),
    body: Joi.string().trim().max(4000).allow('', null),
    dueAt: Joi.date().iso().allow(null),
    priority: Joi.string().valid(...PRIORITIES).default('normal'),
    assigneeId: Joi.number().integer().positive().required(),
    areaId: Joi.number().integer().positive().required(),
    isRequired: Joi.boolean().default(true),
    isMilestone: Joi.boolean().default(false)
}).unknown(false);

const operationalIntelligenceSignalListSchema = Joi.object({
    status: Joi.string().trim().uppercase().valid('ALL', ...OPERATIONAL_INTELLIGENCE_SIGNAL_STATUSES).default('ALL'),
    signalType: Joi.string().trim().uppercase().valid('ALL', ...OPERATIONAL_INTELLIGENCE_SIGNAL_TYPES).default('ALL'),
    areaId: Joi.alternatives().try(
        Joi.string().valid('all'),
        Joi.number().integer().positive()
    ).default('all'),
    page: Joi.number().integer().min(1).max(20).default(1),
    pageSize: Joi.number().integer().min(1).max(50).default(25)
}).unknown(false);

const operationalIntelligenceSignalCreateSchema = Joi.object({
    signalType: Joi.string().trim().uppercase().valid(...OPERATIONAL_INTELLIGENCE_SIGNAL_TYPES).required(),
    severity: Joi.string().trim().lowercase().valid(...OPERATIONAL_INTELLIGENCE_SIGNAL_SEVERITIES).default('info'),
    title: Joi.string().trim().min(3).max(255).required(),
    summary: Joi.string().trim().max(4000).allow('', null),
    fingerprint: Joi.string().trim().max(128).allow('', null),
    dedupeKey: Joi.string().trim().max(255).allow('', null),
    evidence: Joi.object().unknown(true).allow(null),
    suggestedAction: Joi.string().trim().max(4000).allow('', null),
    periodStart: Joi.date().iso().allow(null),
    periodEnd: Joi.date().iso().allow(null),
    areaId: Joi.number().integer().positive().allow(null),
    reviewOwnerUserId: Joi.number().integer().positive().allow(null),
    reviewDueAt: Joi.date().iso().allow(null)
}).unknown(false);

const operationalIntelligenceSignalMaterializeSchema = Joi.object({
    period: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
    offset: Joi.number().integer().min(0).max(120).default(0),
    start: Joi.date().iso(),
    end: Joi.date().iso().greater(Joi.ref('start'))
}).and('start', 'end').unknown(false);

const operationalIntelligenceSignalReviewSchema = Joi.object({
    status: Joi.string().trim().uppercase().valid('OPEN', 'ACKNOWLEDGED', 'DISMISSED').required(),
    reviewNote: Joi.string().trim().max(4000).allow('', null)
}).unknown(false);

const operationalIntelligenceSignalWorkflowSchema = Joi.object({
    reviewOwnerUserId: Joi.number().integer().positive().allow(null),
    reviewDueAt: Joi.date().iso().allow(null),
    suggestedAction: Joi.string().trim().max(4000).allow('', null),
    reviewNote: Joi.string().trim().max(4000).allow('', null)
}).or('reviewOwnerUserId', 'reviewDueAt', 'suggestedAction', 'reviewNote').unknown(false);

const operationalIntelligenceSignalTaskSchema = Joi.object({
    title: Joi.string().trim().max(255).allow('', null),
    subType: Joi.string().trim().max(100).allow('', null),
    priority: Joi.string().valid(...PRIORITIES),
    assigneeId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    suggestedAction: Joi.string().trim().max(4000).allow('', null),
    reviewNote: Joi.string().trim().max(4000).allow('', null),
    payload: Joi.object().unknown(true),
    steps: Joi.array().items(taskStepCreateSchema).max(20)
}).unknown(false);

module.exports = {
    validate,
    validateStatusTransition,
    createTaskSchema,
    updateTaskSchema,
    createNoticeSchema,
    updateNoticeSchema,
    noticeTaskLinkSchema,
    noticeCommentCreateSchema,
    taskNoticeLinkSchema,
    taskStepCreateSchema,
    taskStepUpdateSchema,
    taskStepReorderSchema,
    taskStepGenerateSuggestionSchema,
    taskStepActionSuggestionSchema,
    attachmentUploadSchema,
    attachmentListSchema,
    updateTaskNoteSchema,
    autoclassifySchema,
    smsWebhookSchema,
    emailWebhookSchema,
    voiceWebhookSchema,
    wineryBrandSchema,
    wineryBookingsSchema,
    operationalAreaProfileSchema,
    areaProductListingSchema,
    wineryPolicySchema,
    wineryFaqSchema,
    wineryFaqUpdateSchema,
    winerySopSchema,
    winerySopUpdateSchema,
    wineryIntegrationSchema,
    wineryIntegrationTestSchema,
    areaIntegrationConfigSchema,
    areaIntegrationTestSchema,
    emailSyncSchema,
    integrationEventCreateSchema,
    integrationEventListSchema,
    integrationEventReviewSchema,
    automationRuleCreateSchema,
    automationRuleUpdateSchema,
    automationRuleStatusSchema,
    automationRuleEvaluateSchema,
    automationRuleListSchema,
    automationRunListSchema,
    automationBindingListSchema,
    automationCapabilityListSchema,
    automationTemplateInstallSchema,
    winerySettingsSchema,
    wineryContactSchema,
    operationalAreaCreateSchema,
    operationalAreaUpdateSchema,
    areaMembershipReplaceSchema,
    createOperationalRequestSchema,
    updateOperationalRequestSchema,
    decideOperationalRequestSchema,
    createOperationalRecordSchema,
    updateOperationalRecordSchema,
    operationalItemListSchema,
    operationalItemCommentSchema,
    operationalItemRelationSchema,
    operationalItemConversionSchema,
    operationsFeedQuerySchema,
    projectCreateSchema,
    projectUpdateSchema,
    projectListSchema,
    projectParticipantCreateSchema,
    projectParticipantUpdateSchema,
    projectItemCreateSchema,
    projectItemUpdateSchema,
    projectItemLookupSchema,
    projectDependencyCreateSchema,
    projectLeadSchema,
    projectTaskCreateSchema,
    operationalIntelligenceSignalListSchema,
    operationalIntelligenceSignalCreateSchema,
    operationalIntelligenceSignalMaterializeSchema,
    operationalIntelligenceSignalReviewSchema,
    operationalIntelligenceSignalWorkflowSchema,
    operationalIntelligenceConfigSchema,
    operationalIntelligenceConfigPreviewSchema,
    operationalIntelligenceSignalTaskSchema,
    createMemberSchema,
    updateMemberSchema,
    mergeMemberSchema,
    VALID_STATUS_TRANSITIONS,
    CATEGORIES,
    NOTICE_CATEGORIES,
    NOTICE_PRIORITIES,
    STATUSES,
    WORKFLOW_STATES,
    TASK_ORIGINS,
    INBOUND_METHODS,
    INTEGRATION_DOMAINS,
    AREA_INTEGRATION_DOMAINS,
    INTEGRATION_STATUSES,
    INTEGRATION_AUTH_METHODS,
    INTEGRATION_EVENT_TYPES,
    CANONICAL_INTEGRATION_EVENT_TYPE_PATTERN,
    INTEGRATION_EVENT_STATUSES,
    INTEGRATION_INTAKE_METHODS,
    WAITING_ON,
    STEP_TYPES,
    STEP_STATUSES,
    STEP_SUGGESTION_STATUSES
};
