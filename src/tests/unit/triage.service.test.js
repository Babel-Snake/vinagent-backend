const { triageMessage } = require('../../services/triage.service');
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

    it('should classify "address change" as ACCOUNT / ACCOUNT_ADDRESS_CHANGE', async () => {
        const result = await triageMessage({ body: 'I moved to a new address' });
        expect(result.category).toBe('ACCOUNT');
        expect(result.subType).toBe('ACCOUNT_ADDRESS_CHANGE');
        expect(result.customerType).toBe('VISITOR'); // No context provided
    });

    it('should detect MEMBER customer type if context provided', async () => {
        const result = await triageMessage({ body: 'Hi' }, { member: { id: 1 } });
        expect(result.customerType).toBe('MEMBER');
    });

    it('should downgrade ACCOUNT intent to GENERAL if WineClub module disabled (Basic Tier)', async () => {
        // Mock Settings to disable WineClub
        WinerySettings.findOne.mockResolvedValue({
            enableWineClubModule: false,
            enableOrdersModule: true
        });

        const result = await triageMessage(
            { body: 'change my address' },
            { wineryId: 1 }
        );

        expect(result.category).toBe('GENERAL');
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
