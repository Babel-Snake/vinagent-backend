const { Task } = require('../models');

/**
 * Analyses a message to determine the intent and basic task properties.
 *
 * @param {Object} message - The message object (must have a 'body' property)
 * @param {Object} [context] - Optional context (member, winery)
 * @returns {Promise<Object>} - Returns { type, status, priority, payload }
 */
async function triageMessage(message, context = {}) {
    const body = (message.body || '').toLowerCase();

    // 1. Determine Customer Type
    let customerType = 'UNKNOWN';
    if (context.member) {
        customerType = 'MEMBER';
    } else {
        customerType = 'VISITOR'; // Default for non-members
    }

    // 2. Detect Intent (SubType) & Derive Category
    let category = 'GENERAL';
    let subType = 'GENERAL_ENQUIRY'; // Default
    let priority = 'normal';

    // Simple keyword matching for MVP (replacing old logic)
    if (body.includes('address') || body.includes('move')) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_ADDRESS_CHANGE';
    } else if (body.includes('payment') || body.includes('card') || body.includes('billing')) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_PAYMENT_ISSUE';
        priority = 'high';
    } else if (body.includes('book') || body.includes('tasting') || body.includes('visit')) {
        category = 'BOOKING';
        subType = customerType === 'MEMBER' ? 'BOOKING_NEW' : 'BOOKING_NEW'; // Identifying as same for now
    } else if (body.includes('delivery') || body.includes('shipping') || body.includes('track')) {
        category = 'ORDER';
        subType = 'ORDER_SHIPPING_DELAY';
    }

    // 3. Check Tier / Featue Flags & Downgrade if needed
    const contextWineryId = context.wineryId || (context.member && context.member.wineryId);
    if (contextWineryId) {
        const { WinerySettings } = require('../models');
        const settings = await WinerySettings.findOne({ where: { wineryId: contextWineryId } });

        if (settings) {
            // Basic Tier Logic: Downgrade Advanced Categories to GENERAL
            if (category === 'ACCOUNT' && !settings.enableWineClubModule) {
                category = 'GENERAL';
                subType = 'GENERAL_ENQUIRY'; // Downgrade intent
            }
            if (category === 'ORDER' && !settings.enableOrdersModule) {
                category = 'GENERAL';
                subType = 'GENERAL_ENQUIRY';
            }
            if (category === 'BOOKING' && !settings.enableBookingModule) {
                category = 'GENERAL';
                subType = 'GENERAL_ENQUIRY';
            }
        }
    }

    return {
        type: subType, // Legacy support (map subType to type)
        category,
        subType,
        customerType,
        status: 'PENDING_REVIEW',
        priority,
        payload: {},
        requiresApproval: true
    };
}

module.exports = {
    triageMessage
};
