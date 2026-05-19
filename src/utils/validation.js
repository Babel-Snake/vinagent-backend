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
const ATTACHMENT_ENTITY_TYPES = ['TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE'];

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
    audienceType: Joi.string().valid(...NOTICE_AUDIENCE_TYPES).default('all_staff'),
    audienceRoles: Joi.array().items(Joi.string().valid(...NOTICE_AUDIENCE_ROLES)).max(10).default([]),
    audienceUserIds: Joi.array().items(Joi.number().integer().positive()).max(100).default([]),
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
    return value;
}, 'notice date validation');

const updateNoticeSchema = Joi.object({
    title: Joi.string().trim().min(1).max(200),
    body: Joi.string().trim().min(1).max(10000),
    category: Joi.string().valid(...NOTICE_CATEGORIES),
    priority: Joi.string().valid(...NOTICE_PRIORITIES),
    isPinned: Joi.boolean(),
    audienceType: Joi.string().valid(...NOTICE_AUDIENCE_TYPES),
    audienceRoles: Joi.array().items(Joi.string().valid(...NOTICE_AUDIENCE_ROLES)).max(10),
    audienceUserIds: Joi.array().items(Joi.number().integer().positive()).max(100),
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

const winerySopSchema = Joi.object({
    title: Joi.string().required().max(200),
    body: Joi.string().required().max(5000)
});

const INTEGRATION_DOMAINS = ['sms', 'email', 'pos', 'crm', 'booking', 'delivery'];
const INTEGRATION_STATUSES = ['not_connected', 'connected', 'error', 'needs_reauth'];
const INTEGRATION_AUTH_METHODS = ['none', 'api_key', 'oauth', 'webhook', 'manual'];

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
        .default({})
    // planTier excluded for security (admin only via billing)
});

const wineryIntegrationTestSchema = Joi.object({
    domain: Joi.string().valid(...INTEGRATION_DOMAINS).required()
});

const emailSyncSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional()
});

const winerySettingsSchema = Joi.object({
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
    }).optional()
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
    isActive: Joi.boolean().default(true)
});

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
    wineryPolicySchema,
    winerySopSchema,
    wineryIntegrationSchema,
    wineryIntegrationTestSchema,
    emailSyncSchema,
    winerySettingsSchema,
    wineryContactSchema,
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
    INTEGRATION_STATUSES,
    INTEGRATION_AUTH_METHODS,
    WAITING_ON,
    STEP_TYPES,
    STEP_STATUSES,
    STEP_SUGGESTION_STATUSES
};
