const { triageMessage, classifyStaffNote } = require('../../services/triage.service');
const { WinerySettings } = require('../../models');

// Mock WinerySettings
jest.mock('../../models', () => ({
    WinerySettings: {
        findOne: jest.fn()
    }
}));

describe('Triage Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should classify "address change" as ACCOUNT / ACCOUNT_ADDRESS_CHANGE', async () => {
        const result = await triageMessage({ body: 'I need to change my address please' });
        expect(result.category).toBe('ACCOUNT');
        expect(result.subType).toBe('ACCOUNT_ADDRESS_CHANGE');
        expect(result.customerType).toBe('VISITOR'); // No context provided
    });

    test('should classify "out of pens" as OPERATIONS / OPERATIONS_SUPPLY_REQUEST', async () => {
        const result = await triageMessage({ body: 'We are out of pens at the front desk' });
        expect(result.category).toBe('OPERATIONS');
        expect(result.subType).toBe('OPERATIONS_SUPPLY_REQUEST');
    });

    test('should detect NEGATIVE sentiment for "angry" message', async () => {
        const result = await triageMessage({ body: 'I am very angry about my missing order' });
        expect(result.sentiment).toBe('NEGATIVE');
        expect(result.priority).toBe('high');
    });

    test('should classify staff note correctly via classifyStaffNote', async () => {
        const result = await classifyStaffNote({
            text: 'Customer wants a large order of 50 cases for corporate event',
            wineryId: 1
        });
        expect(result.category).toBe('ORDER');
        expect(result.subType).toBe('ORDER_LARGE_ORDER_REQUEST');
        expect(result.payload.originalText).toBeDefined();
        expect(result.suggestedTitle).toContain('ORDER');
    });

    it('should detect MEMBER customer type if context provided', async () => {
        const result = await triageMessage({ body: 'Hi' }, { member: { id: 1 } });
        expect(result.customerType).toBe('MEMBER');
    });

    test('should downgrade ACCOUNT task if module disabled', async () => {
        // Mock WinerySettings findOne to return disabled module
        jest.spyOn(WinerySettings, 'findOne').mockResolvedValue({ enableWineClubModule: false });

        const result = await triageMessage({ body: 'change my address' }, { wineryId: 1 });
        expect(result.category).toBe('GENERAL'); // Downgraded
        expect(result.subType).toBe('GENERAL_ENQUIRY');
    });

    it('should NOT downgrade if WineClub module enabled (Advanced Tier)', async () => {
        // Mock Settings to enable WineClub
        WinerySettings.findOne.mockResolvedValue({
            enableWineClubModule: true
        });

        const result = await triageMessage(
            { body: 'change my address' },
            { wineryId: 1 }
        );

        expect(result.category).toBe('ACCOUNT');
        expect(result.subType).toBe('ACCOUNT_ADDRESS_CHANGE');
    });
});
