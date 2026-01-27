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

    const suggestedChannel = message.source === 'email'
        ? 'email'
        : message.source === 'voice'
            ? 'voice'
            : 'sms';

    const skipAI = process.env.AI_SKIP === 'true';

    // 2. Attempt AI Classification
    if (!skipAI) {
        try {
            const aiResult = await aiService.classify(message.body, { ...context, suggestedChannel });
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



    return {
        type: result.subType, // Legacy
        category: result.category,
        subType: result.subType,
        customerType,
        sentiment: result.sentiment,
        priority: result.priority,
        status: 'PENDING_REVIEW',
        payload: {
            ...result.payload, // Default or existing payload
            // User wants a "brief title which encapsulates the entire thing".
            // We prioritize the suggestedTitle, then the summary, then the fallback.
            summary: result.suggestedTitle || result.summary || result.payload?.summary
        },
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

    const suggestedTitle = `${category} - ${subType.replace(/_/g, ' ')}`;
    return { category, subType, priority, sentiment, payload: { summary }, suggestedTitle };
}




/**
 * Autoclassifies a staff note into a structured task definition.
 * 
 * @param {Object} input - { text, memberId, wineryId, userId }
 * @returns {Promise<Object>} - The proposed task structure
 */
async function classifyStaffNote(input) {
    const { text, memberId, wineryId } = input;
    const { Member } = require('../models');
    const { Op } = require('sequelize');

    // Simulate message object for triage
    const message = { body: text };

    // Fetch member if ID provided to help context
    let context = { wineryId };
    let foundMember = null;

    if (memberId) {
        const member = await Member.findByPk(memberId);
        if (member) {
            context.member = member;
            foundMember = member;
        }
    } else {
        // Try to extract and find member from text
        foundMember = await extractMemberFromText(text, wineryId);
        if (foundMember) {
            context.member = foundMember;
        }
    }

    const classification = await triageMessage(message, context);

    // Enhance payload for staff creation
    return {
        ...classification,
        payload: {
            ...classification.payload,
            originalText: text // Keep original text
        },
        suggestedTitle: classification.suggestedTitle || `${classification.category} - ${classification.subType.replace(/_/g, ' ')}`,
        suggestedAssigneeRole: 'manager', // Logic could be smarter here
        suggestedMember: foundMember ? {
            id: foundMember.id,
            firstName: foundMember.firstName,
            lastName: foundMember.lastName,
            email: foundMember.email,
            phone: foundMember.phone
        } : null
    };
}

/**
 * Attempts to extract a member name from text and find a matching member.
 * Common patterns: "John Smith", "Customer John Smith", "Member: John Smith"
 * 
 * @param {string} text - The staff note text
 * @param {number} wineryId - The winery ID to scope the search
 * @returns {Promise<Object|null>} - The matching member or null
 */
async function extractMemberFromText(text, wineryId) {
    const { Member } = require('../models');
    const { Op } = require('sequelize');

    // Common patterns for member mentions
    const patterns = [
        /(?:customer|member|client|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,  // "Customer John Smith"
        /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+(?:is|has|wants|needs|called|emailed))/gi, // "John Smith is asking..."
        /(?:from|with|about)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi // "call from John Smith"
    ];

    const potentialNames = new Set();

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            potentialNames.add(match[1].trim());
        }
    }

    // Try to find a member for each potential name
    for (const name of potentialNames) {
        const parts = name.split(/\s+/);
        if (parts.length >= 2) {
            const firstName = parts[0];
            const lastName = parts.slice(1).join(' ');

            const member = await Member.findOne({
                where: {
                    wineryId,
                    firstName: { [Op.iLike]: firstName },
                    lastName: { [Op.iLike]: lastName }
                }
            });

            if (member) {
                logger.info('Extracted member from staff note', {
                    name,
                    memberId: member.id,
                    wineryId
                });
                return member;
            }
        }
    }

    return null;
}

module.exports = {
    triageMessage,
    classifyStaffNote
};
