const Joi = require('joi');

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
const WORKFLOW_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED'];
const WAITING_ON = ['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'];
const STEP_TYPES = ['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'];
const STEP_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED'];

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
    metadata: Joi.object().unknown(true).optional()
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
    metadata: Joi.object().unknown(true).optional()
}).min(1);

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
    steps: Joi.array().items(taskStepCreateSchema).max(20).optional(),
    // Suggested Reply Fields
    suggestedReplyBody: Joi.string().max(2000).allow(''),
    suggestedChannel: Joi.string().valid(...CHANNELS),
    suggestedReplySubject: Joi.string().max(200).allow(''),
    suggestedAction: Joi.string().max(4000).allow('', null),
    suggestedRecipientEmail: Joi.string().email().allow('', null),
    suggestedCc: Joi.string().max(1000).allow('', null),
    isPrivateNote: Joi.boolean().default(false)
});

const updateTaskNoteSchema = Joi.object({
    isPrivate: Joi.boolean().required()
});

const updateTaskSchema = Joi.object({
    status: Joi.string().valid(...STATUSES),
    priority: Joi.string().valid(...PRIORITIES),
    category: Joi.string().valid(...CATEGORIES),
    subType: Joi.string().max(50),
    sentiment: Joi.string().valid(...SENTIMENTS),
    payload: Joi.alternatives().try(
        addressPayloadSchema,
        bookingPayloadSchema,
        genericPayloadSchema
    ),
    notes: Joi.string().max(2000).allow(''),
    suggestedReplyBody: Joi.string().max(2000).allow(''),
    suggestedChannel: Joi.string().valid(...CHANNELS),
    suggestedReplySubject: Joi.string().max(200).allow(''),
    assigneeId: Joi.number().integer().positive().allow(null),
    parentTaskId: Joi.number().integer().positive().allow(null),
    dueAt: Joi.date().iso().allow(null),
    resolutionSummary: Joi.string().max(2000).allow('', null),
    regenerateSuggestedReply: Joi.boolean(),
    isPrivateNote: Joi.boolean()
}).min(1);

const autoclassifySchema = Joi.object({
    text: Joi.string().required().min(1).max(5000),
    memberId: Joi.number().integer().positive().optional()
});

const smsWebhookSchema = Joi.object({
    From: Joi.string().required(),
    To: Joi.string().required(),
    Body: Joi.string().allow('').optional(),
    MessageSid: Joi.string().required()
}).unknown(true);

const emailWebhookSchema = Joi.object({
    from: Joi.string().email().required(),
    to: Joi.string().email().required(),
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

const wineryIntegrationSchema = Joi.object({
    smsProvider: Joi.string().valid('twilio', 'messagemedia', 'other').default('twilio'),
    smsFromNumber: Joi.string().max(20).allow(''),
    emailProvider: Joi.string().valid('sendgrid', 'mailgun', 'ses', 'other').default('sendgrid'),
    emailFromAddress: Joi.string().email().allow(''),
    channelsEnabled: Joi.array().items(Joi.string()).optional(),
    kioskModeEnabled: Joi.boolean(),
    posProvider: Joi.string().valid('square', 'shopify', 'vend', 'lightspeed', 'other').default('other'),
    crmProvider: Joi.string().valid('commerce7', 'winedirect', 'ecellar', 'other').default('other'),
    bookingProvider: Joi.string().valid('sevenrooms', 'resy', 'opentable', 'nowbookit', 'other').default('other'),
    deliveryProvider: Joi.string().valid('auspost', 'shippit', 'startrack', 'other').default('other')
    // planTier excluded for security (admin only via billing)
});

// --- MEMBER SCHEMAS ---

const MEMBER_SOURCES = ['manual', 'sms', 'email', 'booking', 'wine_club', 'pos', 'import', 'website', 'referral', 'walk_in'];
const LOYALTY_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum'];
const CONTACT_METHODS = ['email', 'sms', 'phone', 'any'];

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
    email: Joi.string().email().allow('', null),
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

const wineryContactSchema = Joi.object({
    name: Joi.string().required().max(100),
    role: Joi.string().required().max(100),
    email: Joi.string().email().allow('', null),
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
    taskStepCreateSchema,
    taskStepUpdateSchema,
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
    wineryContactSchema,
    createMemberSchema,
    updateMemberSchema,
    VALID_STATUS_TRANSITIONS,
    CATEGORIES,
    STATUSES,
    WORKFLOW_STATES,
    WAITING_ON,
    STEP_TYPES,
    STEP_STATUSES
};
