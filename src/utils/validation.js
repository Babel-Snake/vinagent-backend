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
const STATUSES = ['PENDING_REVIEW', 'APPROVED', 'AWAITING_MEMBER_ACTION', 'REJECTED', 'EXECUTED', 'CANCELLED'];
const PRIORITIES = ['low', 'normal', 'high'];
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
const CUSTOMER_TYPES = ['MEMBER', 'VISITOR', 'UNKNOWN'];
const CHANNELS = ['sms', 'email', 'voice', 'none'];

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
}).unknown(true); // Allow extra fields for flexibility, but at least define expected ones

// --- STATUS TRANSITION RULES ---
const VALID_STATUS_TRANSITIONS = {
    'PENDING_REVIEW': ['APPROVED', 'REJECTED', 'CANCELLED'],
    'APPROVED': ['EXECUTED', 'AWAITING_MEMBER_ACTION', 'CANCELLED'],
    'AWAITING_MEMBER_ACTION': ['EXECUTED', 'CANCELLED'],
    'REJECTED': ['PENDING_REVIEW'], // Can be re-opened
    'EXECUTED': [], // Terminal
    'CANCELLED': ['PENDING_REVIEW'] // Can be re-opened
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
    parentTaskId: Joi.number().integer().positive().allow(null)
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
    parentTaskId: Joi.number().integer().positive().allow(null)
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

const wineryIntegrationSchema = Joi.object({
    smsProvider: Joi.string().valid('twilio', 'other').default('twilio'),
    smsFromNumber: Joi.string().max(20).allow(''),
    emailProvider: Joi.string().valid('sendgrid', 'other').default('sendgrid'),
    emailFromAddress: Joi.string().email().allow(''),
    channelsEnabled: Joi.array().items(Joi.string()).optional(),
    kioskModeEnabled: Joi.boolean()
    // planTier excluded for security (admin only via billing)
});


module.exports = {
    validate,
    validateStatusTransition,
    createTaskSchema,
    updateTaskSchema,
    autoclassifySchema,
    smsWebhookSchema,
    emailWebhookSchema,
    voiceWebhookSchema,
    wineryBrandSchema,
    wineryBookingsSchema,
    wineryPolicySchema,
    wineryIntegrationSchema,
    VALID_STATUS_TRANSITIONS,
    CATEGORIES,
    STATUSES
};
