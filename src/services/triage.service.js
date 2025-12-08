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

    let type = 'GENERAL_QUERY';
    let priority = 'normal';

    // Simple keyword matching for MVP
    if (body.includes('address') || body.includes('move')) {
        type = 'ADDRESS_CHANGE';
    } else if (body.includes('payment') || body.includes('card') || body.includes('billing')) {
        type = 'PAYMENT_ISSUE';
        priority = 'high';
    } else if (body.includes('book') || body.includes('tasting') || body.includes('visit')) {
        type = 'BOOKING_REQUEST';
    } else if (body.includes('delivery') || body.includes('shipping') || body.includes('track')) {
        type = 'DELIVERY_ISSUE';
    }

    return {
        type,
        status: 'PENDING_REVIEW',
        priority,
        payload: {}, // In future, extract entities here
        requiresApproval: true
    };
}

module.exports = {
    triageMessage
};
