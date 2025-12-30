const { Task, WinerySettings } = require('../models');

/**
 * Analyses a message to determine the intent and basic task properties.
 *
 * @param {Object} message - The message object (must have a 'body' property)
 * @param {Object} [context] - Optional context (member, winery)
 * @returns {Promise<Object>} - Returns { type, status, priority, payload }
 */
const aiService = require('./ai');
const logger = require('../config/logger');

async function triageMessage(message, context = {}) {
    const body = (message.body || '').toLowerCase();

    // 1. Determine Customer Type
    let customerType = 'UNKNOWN';
    if (context.member) {
        customerType = 'MEMBER';
    } else {
        customerType = 'VISITOR';
    }

    let result = {
        category: 'GENERAL',
        subType: 'GENERAL_ENQUIRY',
        sentiment: 'NEUTRAL',
        priority: 'normal',
        payload: { summary: body.substring(0, 50) }
    };

    const skipAI = process.env.AI_SKIP === 'true';

    // 2. Attempt AI Classification
    if (!skipAI) {
        try {
            const aiResult = await aiService.classify(message.body, context);
            // Merge AI result
            result = { ...result, ...aiResult };
        } catch (err) {
            logger.warn('AI Triage unavailable/failed', { error: err.message, body: body.substring(0, 50) });
            // 3. Fallback to Heuristics (Legacy Logic)
            result = fallbackHeuristics(body, customerType);
        }
    } else {
        result = fallbackHeuristics(body, customerType);
    }

    // 4. Feature Flag / Tier Enforcement
    const contextWineryId = context.wineryId || (context.member && context.member.wineryId);
    if (contextWineryId) {
        try {
            const settings = await WinerySettings.findOne({ where: { wineryId: contextWineryId } });

            if (settings) {
                if (result.category === 'ACCOUNT' && !settings.enableWineClubModule) {
                    result.category = 'GENERAL';
                    result.subType = 'GENERAL_ENQUIRY';
                }
                if (result.category === 'ORDER' && !settings.enableOrdersModule) {
                    result.category = 'GENERAL';
                    result.subType = 'GENERAL_ENQUIRY';
                }
                if (result.category === 'BOOKING' && !settings.enableBookingModule) {
                    result.category = 'GENERAL';
                    result.subType = 'GENERAL_ENQUIRY';
                }
            } else {
                // Settings absent: Skip feature gating (Default Allow)
                // or we could log a warning.
            }
        } catch (err) {
            logger.warn('Triage: Failed to check settings, defaulting to GENERAL', { wineryId: contextWineryId, error: err.message });
            // Fallback to GENERAL on DB error
            result.category = 'GENERAL';
            result.subType = 'GENERAL_ENQUIRY';
        }
    }

    const suggestedChannel = message.source === 'email'
        ? 'email'
        : message.source === 'voice'
            ? 'voice'
            : 'sms';

    return {
        type: result.subType, // Legacy
        category: result.category,
        subType: result.subType,
        customerType,
        sentiment: result.sentiment,
        priority: result.priority,
        status: 'PENDING_REVIEW',
        payload: result.payload || {},
        requiresApproval: true,
        suggestedTitle: result.suggestedTitle, // Pass through if AI generated
        suggestedReplyBody: result.suggestedReply || null,
        suggestedChannel
    };
}

// Fallback Rules (The heuristic logic extracted)
function fallbackHeuristics(body, customerType) {
    let category = 'GENERAL';
    let subType = 'GENERAL_ENQUIRY';
    let priority = 'normal';
    let sentiment = 'NEUTRAL';
    let summary = body.substring(0, 50);

    // Heuristic Sentiment Analysis
    const negativeKeywords = ['angry', 'upset', 'complain', 'bad', 'terrible', 'rude', 'late', 'missing', 'failed'];
    if (negativeKeywords.some(kw => body.includes(kw))) {
        sentiment = 'NEGATIVE';
        priority = 'high';
    }

    // Extended Keyword Matching
    // OPERATIONS
    if (body.includes('out of') || body.includes('need more') || body.includes('supply') || body.includes('printer')) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_SUPPLY_REQUEST';
    } else if (body.includes('leaking') || body.includes('broken') || body.includes('noise') || body.includes('fix')) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_MAINTENANCE_REQUEST';
    } else if (body.includes('upset') || body.includes('manager') || body.includes('escalate')) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_ESCALATION';
        sentiment = 'NEGATIVE';
    }
    // ORDER - Wholesale / Large
    else if (body.includes('wholesale') || body.includes('pallet') || body.includes('trade')) {
        category = 'ORDER';
        subType = 'ORDER_WHOLESALE_ENQUIRY';
    } else if (body.includes('large order') || body.includes('corporate') || body.includes('bulk')) {
        category = 'ORDER';
        subType = 'ORDER_LARGE_ORDER_REQUEST';
    }
    // ACCOUNT
    else if (body.includes('address') || body.includes('move')) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_ADDRESS_CHANGE';
    } else if (body.includes('payment') || body.includes('card') || body.includes('billing')) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_PAYMENT_ISSUE';
        priority = 'high';
    } else if (body.includes('login') || body.includes('password') || body.includes('locked')) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_LOGIN_ISSUE';
    }
    // BOOKING
    else if (body.includes('book') || body.includes('tasting') || body.includes('visit')) {
        category = 'BOOKING';
        subType = 'BOOKING_NEW';
    }
    // ORDER - Standard
    else if (body.includes('delivery') || body.includes('shipping') || body.includes('track')) {
        category = 'ORDER';
        subType = 'ORDER_SHIPPING_DELAY';
    }

    return { category, subType, priority, sentiment, payload: { summary } };
}




/**
 * Autoclassifies a staff note into a structured task definition.
 * 
 * @param {Object} input - { text, memberId, wineryId, userId }
 * @returns {Promise<Object>} - The proposed task structure
 */
async function classifyStaffNote(input) {
    const { text, memberId, wineryId } = input;

    // Simulate message object for triage
    const message = { body: text };

    // Fetch member if ID provided to help context
    let context = { wineryId };
    if (memberId) {
        const { Member } = require('../models');
        const member = await Member.findByPk(memberId);
        if (member) context.member = member;
    }

    const classification = await triageMessage(message, context);

    // Enhance payload for staff creation
    return {
        ...classification,
        payload: {
            ...classification.payload,
            originalText: text // Keep original text
        },
        suggestedTitle: `${classification.category} - ${classification.subType.replace(/_/g, ' ')}`,
        suggestedAssigneeRole: 'manager' // Logic could be smarter here
    };
}

module.exports = {
    triageMessage,
    classifyStaffNote
};
