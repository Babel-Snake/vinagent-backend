const { getWorkflowTemplateForTask } = require('./taskWorkflowTemplates');

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractPrimaryText(text) {
    const rawText = normalizeText(text);

    const originalRequestMatch = rawText.match(/Original Request:\s*"([^"]+)"/i);
    if (originalRequestMatch) {
        return normalizeText(originalRequestMatch[1]);
    }

    const inputTextMatch = rawText.match(/Input Text:\s*"([^"]+)"/i);
    if (inputTextMatch) {
        return normalizeText(inputTextMatch[1]);
    }

    return rawText;
}

function includesAny(body, keywords) {
    return keywords.some((keyword) => body.includes(keyword));
}

function buildHeuristicAction(subType) {
    switch (subType) {
        case 'ACCOUNT_ADDRESS_CHANGE':
            return 'Verify the new address details and send the member the secure confirmation flow.';
        case 'ACCOUNT_PAYMENT_ISSUE':
            return 'Review billing history, confirm the payment issue, and resolve it before replying.';
        case 'ACCOUNT_LOGIN_ISSUE':
            return 'Confirm the access issue and send the reset or unlock steps.';
        case 'BOOKING_NEW':
            return 'Check the requested date, time, and capacity before confirming the booking.';
        case 'ORDER_SHIPPING_DELAY':
            return 'Review the order and courier status, then update the customer with the latest delivery outcome.';
        case 'ORDER_DAMAGED':
            return 'Confirm the damage details, choose the refund or replacement path, and communicate the resolution.';
        case 'ORDER_GENERAL_ENQUIRY':
            return 'Review the order request and determine the best next sales or fulfilment action.';
        case 'OPERATIONS_SUPPLY_REQUEST':
            return 'Check current stock on site and arrange replenishment for the missing supply.';
        case 'OPERATIONS_MAINTENANCE_REQUEST':
            return 'Confirm the maintenance issue and coordinate the repair path.';
        case 'OPERATIONS_ESCALATION':
            return 'Escalate the issue to a manager with the key customer and operational context.';
        default:
            return 'Review the request, decide the next owner, and send the appropriate follow-up.';
    }
}

function buildHeuristicReply({ category, subType, context }) {
    const firstName = context.member?.firstName ? ` ${context.member.firstName}` : '';

    switch (subType) {
        case 'ACCOUNT_ADDRESS_CHANGE':
            return `Hi${firstName}, thanks for the update. We can help with your address change and will send the confirmation step shortly.`;
        case 'ACCOUNT_PAYMENT_ISSUE':
            return `Hi${firstName}, thanks for flagging the payment issue. We are reviewing the account and will update you shortly with the next step.`;
        case 'ACCOUNT_LOGIN_ISSUE':
            return `Hi${firstName}, we can help with the login issue. We are checking the account access details and will send the recovery step shortly.`;
        case 'BOOKING_NEW':
            return `Hi${firstName}, thanks for reaching out about your booking. We are checking availability now and will confirm the next step shortly.`;
        case 'ORDER_SHIPPING_DELAY':
            return `Hi${firstName}, thanks for checking on your order. We are reviewing the delivery status and will update you as soon as we confirm the latest details.`;
        case 'ORDER_DAMAGED':
            return `Hi${firstName}, I am sorry to hear your order arrived damaged. We are reviewing the best resolution and will come back to you shortly.`;
        case 'OPERATIONS_ESCALATION':
            return 'This issue has been escalated internally for manager review.';
        default:
            if (category === 'ORDER') {
                return `Hi${firstName}, thanks for your order enquiry. We are reviewing the details and will follow up shortly.`;
            }
            return `Hi${firstName}, thanks for reaching out. We are reviewing your request and will follow up shortly.`;
    }
}

function classifyMessageHeuristically(text, context = {}) {
    const sourceText = extractPrimaryText(text);
    const body = sourceText.toLowerCase();

    let category = 'GENERAL';
    let subType = 'GENERAL_ENQUIRY';
    let priority = 'normal';
    let sentiment = 'NEUTRAL';

    if (includesAny(body, ['angry', 'upset', 'complain', 'bad', 'terrible', 'rude', 'late', 'missing', 'failed', 'broken', 'damaged'])) {
        sentiment = 'NEGATIVE';
        priority = 'high';
    }

    if (includesAny(body, ['out of', 'need more', 'low on', 'supply'])
        || (body.includes('printer') && includesAny(body, ['ink', 'paper', 'toner']))) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_SUPPLY_REQUEST';
    } else if (includesAny(body, ['manager', 'escalate'])
        || (body.includes('upset') && body.includes('staff'))) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_ESCALATION';
        sentiment = 'NEGATIVE';
        priority = 'high';
    } else if ((includesAny(body, ['leaking', 'noise', 'repair', 'maintenance'])
        || (body.includes('broken') && !includesAny(body, ['bottle', 'order', 'delivery', 'shipping']))
        || (body.includes('fix') && !body.includes('address')))) {
        category = 'OPERATIONS';
        subType = 'OPERATIONS_MAINTENANCE_REQUEST';
    } else if (includesAny(body, ['wholesale', 'pallet', 'trade'])) {
        category = 'ORDER';
        subType = 'ORDER_WHOLESALE_ENQUIRY';
    } else if (includesAny(body, ['large order', 'corporate', 'bulk'])) {
        category = 'ORDER';
        subType = 'ORDER_LARGE_ORDER_REQUEST';
    } else if (includesAny(body, ['address', 'change of address', 'moved house', 'moving house'])) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_ADDRESS_CHANGE';
    } else if (includesAny(body, ['payment', 'card', 'billing', 'charged', 'charge failed'])) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_PAYMENT_ISSUE';
        priority = 'high';
    } else if (includesAny(body, ['login', 'password', 'locked out', 'locked'])) {
        category = 'ACCOUNT';
        subType = 'ACCOUNT_LOGIN_ISSUE';
    } else if (includesAny(body, ['damaged', 'arrived broken', 'broken bottle', 'smashed'])
        && includesAny(body, ['order', 'delivery', 'shipping', 'arrived', 'bottle', 'wine'])) {
        category = 'ORDER';
        subType = 'ORDER_DAMAGED';
        sentiment = 'NEGATIVE';
        priority = 'high';
    } else if (includesAny(body, ['delivery', 'shipping', 'tracking', 'track my'])
        || (body.includes('order') && includesAny(body, ['where', 'status', 'late']))) {
        category = 'ORDER';
        subType = 'ORDER_SHIPPING_DELAY';
    } else if (includesAny(body, ['book', 'booking', 'tasting', 'visit', 'reservation', 'table for'])) {
        category = 'BOOKING';
        subType = 'BOOKING_NEW';
    } else if ((includesAny(body, ['order', 'buy', 'purchase']) && includesAny(body, ['wine', 'bottle', 'case', 'club']))
        || body.includes('order wine')) {
        category = 'ORDER';
        subType = 'ORDER_GENERAL_ENQUIRY';
    }

    const summary = sourceText ? sourceText.slice(0, 120) : 'General enquiry';

    return {
        category,
        subType,
        priority,
        sentiment,
        summary,
        payload: { summary },
        suggestedTitle: `${category} - ${subType.replace(/_/g, ' ')}`,
        suggestedAction: buildHeuristicAction(subType),
        suggestedReply: buildHeuristicReply({ category, subType, context }),
        suggestedAssigneeId: null,
        suggestedRecipientEmail: context.member?.email || null,
        suggestedCc: null,
        suggestedSteps: getWorkflowTemplateForTask({ category, subType, suggestedAssigneeId: null })
    };
}

module.exports = {
    classifyMessageHeuristically
};
