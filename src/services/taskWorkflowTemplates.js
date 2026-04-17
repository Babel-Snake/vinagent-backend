const { STEP_TYPES, WAITING_ON } = require('../utils/validation');

function inferStepType(subType) {
    if (!subType) return 'INTERNAL';
    if (subType.startsWith('BOOKING_')) return 'EXECUTION';
    if (subType.startsWith('ORDER_')) return 'EXTERNAL';
    if (subType.startsWith('ACCOUNT_')) return 'CUSTOMER_MESSAGE';
    if (subType.startsWith('OPERATIONS_')) return 'INTERNAL';
    return 'CUSTOMER_MESSAGE';
}

function inferWaitingOn(stepType) {
    if (stepType === 'CUSTOMER_WAIT') return 'CUSTOMER';
    if (stepType === 'APPROVAL') return 'MANAGER';
    if (stepType === 'EXTERNAL') return 'EXTERNAL';
    return 'STAFF';
}

function normalizeTemplateStep(step, index, fallbackOwnerUserId, subType) {
    const stepType = STEP_TYPES.includes(step.stepType) ? step.stepType : inferStepType(subType);
    const waitingOn = WAITING_ON.includes(step.waitingOn) ? step.waitingOn : inferWaitingOn(stepType);
    const hasExplicitOwner = Object.prototype.hasOwnProperty.call(step, 'ownerUserId');

    return {
        title: String(step.title || `Step ${index + 1}`).trim().slice(0, 200),
        description: step.description ? String(step.description).trim().slice(0, 4000) : null,
        stepType,
        waitingOn,
        ownerUserId: hasExplicitOwner
            ? (Number.isInteger(step.ownerUserId) ? step.ownerUserId : null)
            : fallbackOwnerUserId,
        dueInHours: Number.isFinite(step.dueInHours) && step.dueInHours > 0 ? step.dueInHours : null
    };
}

const subTypeTemplates = {
    ACCOUNT_ADDRESS_CHANGE: ({ ownerUserId }) => [
        {
            title: 'Verify the proposed address details',
            description: 'Check the captured address fields are complete before contacting the member.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 4
        },
        {
            title: 'Send secure address confirmation',
            description: 'Draft and send the confirmation message or secure link to the member.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 8
        },
        {
            title: 'Await member confirmation',
            description: 'Track the task until the member confirms the address change.',
            stepType: 'CUSTOMER_WAIT',
            waitingOn: 'CUSTOMER',
            ownerUserId: null,
            dueInHours: 72
        }
    ],
    ACCOUNT_PAYMENT_ISSUE: ({ ownerUserId }) => [
        {
            title: 'Review the payment history',
            description: 'Check the billing context, failed charges, and the member account before replying.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Resolve the payment issue',
            description: 'Update billing details, retry the payment, or confirm the next manual action.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 8
        },
        {
            title: 'Send the billing update to the member',
            description: 'Explain the outcome and any next step the member needs to take.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 10
        }
    ],
    ACCOUNT_LOGIN_ISSUE: ({ ownerUserId }) => [
        {
            title: 'Verify the login problem',
            description: 'Confirm whether the issue is with password reset, account lockout, or missing access.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Issue the account recovery step',
            description: 'Send the reset instructions or perform the manual account unlock.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 6
        },
        {
            title: 'Confirm the member can access the account',
            description: 'Follow up if needed and record whether the access issue is resolved.',
            stepType: 'FOLLOW_UP',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 24
        }
    ],
    BOOKING_NEW: ({ ownerUserId }) => [
        {
            title: 'Review booking requirements',
            description: 'Check date, time, party size, and booking policy fit.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Create or confirm the booking',
            description: 'Make the reservation if possible or prepare the response if manual handling is needed.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 6
        },
        {
            title: 'Send booking confirmation to the guest',
            description: 'Confirm the outcome and share next steps with the customer.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 8
        }
    ],
    ORDER_SHIPPING_DELAY: ({ ownerUserId }) => [
        {
            title: 'Review the order and delivery context',
            description: 'Check the order details, shipping timeline, and previous updates before responding.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Check the delivery status with the provider',
            description: 'Confirm the latest tracking status or operational issue with the courier or fulfilment system.',
            stepType: 'EXTERNAL',
            waitingOn: 'EXTERNAL',
            ownerUserId,
            dueInHours: 12
        },
        {
            title: 'Reply to the customer with the delivery update',
            description: 'Share the latest status and tell the customer what will happen next.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 14
        }
    ],
    ORDER_DAMAGED: ({ ownerUserId }) => [
        {
            title: 'Review the damaged order details',
            description: 'Check what arrived damaged, the order record, and any supporting photos or notes.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Approve the replacement or refund path',
            description: 'Decide whether the customer should receive a replacement, credit, or refund.',
            stepType: 'APPROVAL',
            waitingOn: 'MANAGER',
            ownerUserId,
            dueInHours: 8
        },
        {
            title: 'Send the resolution to the customer',
            description: 'Explain the chosen resolution and any delivery or refund timing.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 10
        }
    ],
    OPERATIONS_SUPPLY_REQUEST: ({ ownerUserId }) => [
        {
            title: 'Confirm the missing supply requirement',
            description: 'Check what is needed, how urgent it is, and whether stock already exists on site.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Arrange the supply replenishment',
            description: 'Purchase, transfer, or source the missing supply.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 12
        },
        {
            title: 'Confirm the site is restocked',
            description: 'Record that the supply issue is resolved and no further follow-up is needed.',
            stepType: 'FOLLOW_UP',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 24
        }
    ],
    OPERATIONS_MAINTENANCE_REQUEST: ({ ownerUserId }) => [
        {
            title: 'Inspect the maintenance issue',
            description: 'Confirm the fault, impact, and urgency before dispatching the next action.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Coordinate the repair',
            description: 'Assign an internal fix or arrange the external maintenance callout.',
            stepType: 'EXTERNAL',
            waitingOn: 'EXTERNAL',
            ownerUserId,
            dueInHours: 24
        },
        {
            title: 'Confirm the issue is resolved on site',
            description: 'Verify the fix and record any remaining operational follow-up.',
            stepType: 'FOLLOW_UP',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 30
        }
    ]
};

const categoryTemplates = {
    ORDER: ({ ownerUserId }) => [
        {
            title: 'Review the order context',
            description: 'Check order details, customer history, and any delivery or stock issues.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 4
        },
        {
            title: 'Coordinate the order resolution',
            description: 'Update the order, check with the provider, or prepare the required follow-up.',
            stepType: 'EXTERNAL',
            waitingOn: 'EXTERNAL',
            ownerUserId,
            dueInHours: 24
        },
        {
            title: 'Reply to the customer with the outcome',
            description: 'Send the next response once the order path is confirmed.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 26
        }
    ],
    BOOKING: ({ ownerUserId }) => [
        {
            title: 'Review the booking request',
            description: 'Check the booking details and whether the request fits current policy and capacity.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Confirm the booking outcome',
            description: 'Create the booking or record the reason it cannot proceed.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 8
        },
        {
            title: 'Reply to the guest',
            description: 'Send the confirmation or alternative options to the guest.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 10
        }
    ],
    ACCOUNT: ({ ownerUserId }) => [
        {
            title: 'Review the account request',
            description: 'Confirm the account context and what change or correction is being requested.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 4
        },
        {
            title: 'Complete the account action',
            description: 'Apply the required account update or prepare the member follow-up.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 12
        },
        {
            title: 'Confirm the outcome with the member',
            description: 'Reply with the next step or resolution.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 16
        }
    ],
    OPERATIONS: ({ ownerUserId }) => [
        {
            title: 'Review the operational issue',
            description: 'Confirm the operational impact and assign the right owner.',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 2
        },
        {
            title: 'Complete the operational action',
            description: 'Carry out the required internal fix, escalation, or supplier follow-up.',
            stepType: 'EXECUTION',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 12
        },
        {
            title: 'Confirm the issue is resolved',
            description: 'Record the outcome and any remaining cleanup.',
            stepType: 'FOLLOW_UP',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 24
        }
    ],
    DEFAULT: ({ ownerUserId, subType }) => [
        {
            title: 'Review the request',
            description: 'Confirm what needs to happen and who should own the work.',
            stepType: inferStepType(subType),
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 4
        },
        {
            title: 'Send the next response',
            description: 'Draft or send the appropriate reply once the task is understood.',
            stepType: 'CUSTOMER_MESSAGE',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 8
        },
        {
            title: 'Confirm the task is resolved',
            description: 'Record the outcome and make sure no follow-up is still outstanding.',
            stepType: 'FOLLOW_UP',
            waitingOn: 'STAFF',
            ownerUserId,
            dueInHours: 24
        }
    ]
};

function getWorkflowTemplateForTask({ category, subType, suggestedAssigneeId } = {}) {
    const ownerUserId = Number.isInteger(suggestedAssigneeId) ? suggestedAssigneeId : null;
    const context = { category, subType, ownerUserId };
    const templateFactory = subTypeTemplates[subType]
        || categoryTemplates[category]
        || categoryTemplates.DEFAULT;

    return templateFactory(context)
        .slice(0, 10)
        .map((step, index) => normalizeTemplateStep(step, index, ownerUserId, subType));
}

module.exports = {
    inferStepType,
    inferWaitingOn,
    getWorkflowTemplateForTask
};
