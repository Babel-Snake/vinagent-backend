const { WinerySettings } = require('../models');

/**
 * Analyses a message to determine the intent and basic task properties.
 *
 * @param {Object} message - The message object (must have a 'body' property)
 * @param {Object} [context] - Optional context (member, winery)
 * @returns {Promise<Object>} - Returns { type, status, priority, payload }
 */
const aiService = require('./ai');
const logger = require('../config/logger');
const { STEP_TYPES, WAITING_ON } = require('../utils/validation');
const { inferStepType, inferWaitingOn, getWorkflowTemplateForTask } = require('./taskWorkflowTemplates');
const { classifyMessageHeuristically } = require('./taskClassificationHeuristics');

function normalizeSuggestedSteps(rawSteps, context = {}) {
    const fallback = getWorkflowTemplateForTask(context);
    const source = Array.isArray(rawSteps) && rawSteps.length > 0 ? rawSteps : fallback;

    return source
        .slice(0, 10)
        .map((step, index) => {
            const stepType = STEP_TYPES.includes(step.stepType) ? step.stepType : inferStepType(context.subType);
            const waitingOn = WAITING_ON.includes(step.waitingOn) ? step.waitingOn : inferWaitingOn(stepType);
            let dueAt = null;

            if (step.dueAt) {
                const parsed = new Date(step.dueAt);
                if (!Number.isNaN(parsed.getTime())) {
                    dueAt = parsed.toISOString();
                }
            } else if (Number.isFinite(step.dueInHours) && step.dueInHours > 0) {
                dueAt = new Date(Date.now() + (step.dueInHours * 60 * 60 * 1000)).toISOString();
            }

            return {
                title: String(step.title || `Step ${index + 1}`).trim().slice(0, 200),
                description: step.description ? String(step.description).trim().slice(0, 4000) : null,
                stepType,
                waitingOn,
                ownerUserId: Number.isInteger(step.ownerUserId) ? step.ownerUserId : (context.suggestedAssigneeId || null),
                dueAt,
                sortOrder: index
            };
        });
}

async function triageMessage(message, context = {}) {
    const messageBody = String(message.body || '');

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
        payload: { summary: messageBody.substring(0, 50) }
    };

    const suggestedChannel = context.suggestedChannel
        || message.suggestedChannel
        || (message.source === 'email'
            ? 'email'
            : message.source === 'voice'
                ? 'voice'
                : message.source === 'sms'
                    ? 'sms'
                    : 'sms');

    const skipAI = process.env.AI_SKIP === 'true';

    // 2. Attempt AI Classification
    if (!skipAI) {
        try {
            const aiResult = await aiService.classify(message.body, { ...context, suggestedChannel });
            // Merge AI result
            result = { ...result, ...aiResult };
        } catch (err) {
            logger.warn('AI Triage unavailable/failed', { error: err.message, body: messageBody.substring(0, 50) });
            // 3. Fallback to Heuristics (Legacy Logic)
            result = classifyMessageHeuristically(messageBody, { ...context, customerType, suggestedChannel });
        }
    } else {
        result = classifyMessageHeuristically(messageBody, { ...context, customerType, suggestedChannel });
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



    const suggestedSteps = normalizeSuggestedSteps(result.suggestedSteps, {
        category: result.category,
        subType: result.subType,
        suggestedAssigneeId: result.suggestedAssigneeId || null
    });

    return {
        type: result.subType, // Legacy
        category: result.category,
        subType: result.subType,
        customerType,
        sentiment: result.sentiment,
        priority: result.priority,
        status: 'PENDING',
        payload: {
            ...result.payload, // Default or existing payload
            // User wants a "brief title which encapsulates the entire thing".
            // We prioritize the suggestedTitle, then the summary, then the fallback.
            summary: result.suggestedTitle || result.summary || result.payload?.summary
        },
        requiresApproval: true,
        suggestedTitle: result.suggestedTitle, // Pass through if AI generated
        suggestedReplyBody: result.suggestedReply || null,
        suggestedChannel,
        suggestedAssigneeId: result.suggestedAssigneeId || undefined,
        suggestedAction: result.suggestedAction || undefined,
        suggestedRecipientEmail: suggestedChannel === 'email' ? result.suggestedRecipientEmail || undefined : undefined,
        suggestedCc: suggestedChannel === 'email' ? result.suggestedCc || undefined : undefined,
        suggestedSteps
    };
}

/**
 * Autoclassifies a staff note into a structured task definition.
 * 
 * @param {Object} input - { text, memberId, wineryId, userId }
 * @returns {Promise<Object>} - The proposed task structure
 */
async function classifyStaffNote(input) {
    const {
        text,
        memberId,
        wineryId,
        taskOrigin,
        inboundMethod,
        requesterName,
        requesterEmail,
        requesterPhone,
        suggestedChannel
    } = input;
    const { Member } = require('../models');

    // Simulate message object for triage
    const source = inboundMethod === 'email'
        ? 'email'
        : inboundMethod === 'phone'
            ? 'voice'
            : inboundMethod === 'sms'
                ? 'sms'
                : undefined;
    const message = { body: text, source, suggestedChannel };

    // Fetch member if ID provided to help context
    let context = {
        wineryId,
        taskOrigin,
        inboundMethod,
        requesterName,
        requesterEmail,
        requesterPhone,
        suggestedChannel,
        manualIntake: {
            taskOrigin,
            inboundMethod,
            requesterName,
            requesterEmail,
            requesterPhone,
            preferredResponseChannel: suggestedChannel
        }
    };
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
        suggestedSteps: classification.suggestedSteps || [],
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
                    firstName: { [Op.like]: firstName },
                    lastName: { [Op.like]: lastName }
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
