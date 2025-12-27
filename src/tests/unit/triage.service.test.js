const { triageMessage, classifyStaffNote } = require('../../services/triage.service');
const { WinerySettings } = require('../../models');
const aiService = require('../../services/ai');

// Mock WinerySettings and AI Service
jest.mock('../../models', () => ({
    WinerySettings: {
        findOne: jest.fn()
    },
    Member: {
        findByPk: jest.fn()
    }
}));

jest.mock('../../services/ai', () => ({
    classify: jest.fn()
}));

describe('Triage Service (with AI)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should use AI service to classify text', async () => {
        aiService.classify.mockResolvedValue({
            category: 'ORDER',
            subType: 'ORDER_DAMAGED',
            sentiment: 'NEGATIVE',
            priority: 'high',
            summary: 'Bottle broken'
        });

        const result = await triageMessage({ body: 'My bottle arrived broken!' });

        expect(aiService.classify).toHaveBeenCalled();
        expect(result.category).toBe('ORDER');
        expect(result.subType).toBe('ORDER_DAMAGED');
    });

    test('should fallback to heuristics if AI fails', async () => {
        aiService.classify.mockRejectedValue(new Error('AI Offline'));

        const result = await triageMessage({ body: 'change address' });

        expect(result.category).toBe('ACCOUNT'); // Heuristic match
        expect(result.subType).toBe('ACCOUNT_ADDRESS_CHANGE');
    });

    test('should classify "address change" as ACCOUNT / ACCOUNT_ADDRESS_CHANGE', async () => {
        const result = await triageMessage({ body: 'I need to change my address please' });
        expect(result.category).toBe('ACCOUNT');
        expect(result.subType).toBe('ACCOUNT_ADDRESS_CHANGE');
        expect(result.customerType).toBe('VISITOR'); // No context provided
    });

    test('should classify "out of pens" as OPERATIONS / OPERATIONS_SUPPLY_REQUEST', async () => {
        // Mock AI failure to test heuristics
        aiService.classify.mockRejectedValue(new Error('AI Offline'));
        const result = await triageMessage({ body: 'We are out of pens at the front desk' });
        expect(result.category).toBe('OPERATIONS');
        expect(result.subType).toBe('OPERATIONS_SUPPLY_REQUEST');
    });

    test('should detect NEGATIVE sentiment for "angry" message', async () => {
        // Mock AI failure to test heuristics
        aiService.classify.mockRejectedValue(new Error('AI Offline'));
        const result = await triageMessage({ body: 'I am very angry about my missing order' });
        expect(result.sentiment).toBe('NEGATIVE');
        expect(result.priority).toBe('high');
    });

    test('should classify staff note correctly via classifyStaffNote', async () => {
        // Mock AI Success for staff note
        aiService.classify.mockResolvedValue({
            category: 'OPERATIONS',
            subType: 'OPERATIONS_MAINTENANCE_REQUEST',
            sentiment: 'NEUTRAL',
            priority: 'normal',
            summary: 'Fix printer'
        });

        // Mock Member lookup
        const { Member } = require('../../models');
        Member.findByPk.mockResolvedValue({ id: 99, wineryId: 1 });

        const result = await classifyStaffNote({
            text: 'Printer is broken',
            wineryId: 1,
            userId: 5
        });

        expect(result.category).toBe('OPERATIONS');
        expect(result.suggestedTitle).toBe('OPERATIONS - OPERATIONS MAINTENANCE REQUEST');
    });

    it('should detect MEMBER customer type if context provided', async () => {
        aiService.classify.mockResolvedValue({});
        const result = await triageMessage({ body: 'hi' }, { member: { id: 1 } });
        expect(result.customerType).toBe('MEMBER');
    });

    test('should downgrade ACCOUNT task if module disabled', async () => {
        aiService.classify.mockResolvedValue({ category: 'ACCOUNT' }); // AI says ACCOUNT

        WinerySettings.findOne.mockResolvedValue({ enableWineClubModule: false }); // Helper says NO

        const result = await triageMessage({ body: 'update address' }, { wineryId: 1 });
        expect(result.category).toBe('GENERAL');
    });

    test('should NOT downgrade if WineClub module enabled (Advanced Tier)', async () => {
        aiService.classify.mockResolvedValue({ category: 'ACCOUNT' });
        WinerySettings.findOne.mockResolvedValue({ enableWineClubModule: true });

        const result = await triageMessage({ body: 'update address' }, { wineryId: 1 });
        expect(result.category).toBe('ACCOUNT');
    });

    test('should degrade to GENERAL if settings fetch fails (Resilience)', async () => {
        aiService.classify.mockResolvedValue({ category: 'ACCOUNT' });
        WinerySettings.findOne.mockRejectedValue(new Error('DB Down')); // Simulate failure

        const result = await triageMessage({ body: 'update address' }, { wineryId: 1 });

        // Resilience Check: Should catch error and default to strict/safe (GENERAL) or logic behavior.
        // My implementation forces GENERAL on catch.
        expect(result.category).toBe('GENERAL');
    });
});
