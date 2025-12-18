const Joi = require('joi');

const validate = (schema, data) => {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true // Clean payload
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

// --- SCHEMAS ---

const createTaskSchema = Joi.object({
    category: Joi.string().valid(
        'BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'OPERATIONS', 'INTERNAL', 'SYSTEM'
    ).required(),
    subType: Joi.string().required(),
    customerType: Joi.string().valid('MEMBER', 'VISITOR', 'UNKNOWN').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
    sentiment: Joi.string().valid('POSITIVE', 'NEUTRAL', 'NEGATIVE').default('NEUTRAL'),
    payload: Joi.object().unknown(),
    notes: Joi.string().optional(),
    memberId: Joi.number().integer().allow(null),
    messageId: Joi.number().integer().allow(null),
    assigneeId: Joi.number().integer().allow(null),
    parentTaskId: Joi.number().integer().allow(null)
});

const updateTaskSchema = Joi.object({
    status: Joi.string().valid(
        'PENDING_REVIEW', 'APPROVED', 'AWAITING_MEMBER_ACTION', 'REJECTED', 'EXECUTED', 'CANCELLED'
    ),
    priority: Joi.string().valid('low', 'normal', 'high'),
    category: Joi.string(),
    subType: Joi.string(),
    sentiment: Joi.string().valid('POSITIVE', 'NEUTRAL', 'NEGATIVE'),
    payload: Joi.object().unknown(),
    notes: Joi.string().allow(''),
    suggestedReplyBody: Joi.string().allow(''),
    suggestedChannel: Joi.string().valid('sms', 'email', 'none'),
    suggestedReplySubject: Joi.string().allow(''),
    assigneeId: Joi.number().integer().allow(null),
    parentTaskId: Joi.number().integer().allow(null)
}).min(1); // At least one field to update

const autoclassifySchema = Joi.object({
    text: Joi.string().required().min(1),
    memberId: Joi.number().integer().optional()
});

module.exports = {
    validate,
    createTaskSchema,
    updateTaskSchema,
    autoclassifySchema
};
