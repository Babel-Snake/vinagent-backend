const { getWorkflowTemplateForTask, inferStepType, inferWaitingOn } = require('../../services/taskWorkflowTemplates');

describe('taskWorkflowTemplates', () => {
    test('returns the address change template with an explicit customer wait step', () => {
        const steps = getWorkflowTemplateForTask({
            category: 'ACCOUNT',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            suggestedAssigneeId: 7
        });

        expect(steps).toHaveLength(3);
        expect(steps[0].ownerUserId).toBe(7);
        expect(steps[2].stepType).toBe('CUSTOMER_WAIT');
        expect(steps[2].waitingOn).toBe('CUSTOMER');
        expect(steps[2].ownerUserId).toBeNull();
    });

    test('returns subtype-specific payment issue steps instead of the generic account fallback', () => {
        const steps = getWorkflowTemplateForTask({
            category: 'ACCOUNT',
            subType: 'ACCOUNT_PAYMENT_ISSUE'
        });

        expect(steps.map((step) => step.title)).toEqual([
            'Review the payment history',
            'Resolve the payment issue',
            'Send the billing update to the member'
        ]);
    });

    test('falls back to category and generic defaults when no subtype template exists', () => {
        const orderSteps = getWorkflowTemplateForTask({
            category: 'ORDER',
            subType: 'ORDER_GENERAL_ENQUIRY'
        });
        const genericSteps = getWorkflowTemplateForTask({
            category: 'GENERAL',
            subType: 'GENERAL_ENQUIRY'
        });

        expect(orderSteps[1].stepType).toBe('EXTERNAL');
        expect(orderSteps[1].waitingOn).toBe('EXTERNAL');
        expect(genericSteps[0].stepType).toBe('CUSTOMER_MESSAGE');
        expect(genericSteps[2].stepType).toBe('FOLLOW_UP');
    });

    test('infers step metadata for invalid template inputs', () => {
        expect(inferStepType('BOOKING_NEW')).toBe('EXECUTION');
        expect(inferWaitingOn('APPROVAL')).toBe('MANAGER');
    });
});
