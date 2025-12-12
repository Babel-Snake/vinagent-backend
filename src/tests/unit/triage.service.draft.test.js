const triageService = require('../../services/triage.service');
const aiService = require('../../services/ai');
const { WinerySettings } = require('../../models');

jest.mock('../../services/ai');
jest.mock('../../models');

describe('Triage Service with Drafting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WinerySettings.findOne.mockResolvedValue(null);
    });

    it('should include suggestedReplyBody from AI result', async () => {
        aiService.classify.mockResolvedValue({
            category: 'ACCOUNT',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            sentiment: 'NEUTRAL',
            priority: 'normal',
            payload: { summary: 'Address change' },
            suggestedTitle: 'Update Address',
            suggestedReply: 'Hi, I can help update your address. What is the new one?'
        });

        const result = await triageService.triageMessage({ body: 'Change address' }, { wineryId: 1 });

        expect(result.suggestedReplyBody).toBe('Hi, I can help update your address. What is the new one?');
        expect(result.suggestedChannel).toBe('sms');
    });
});
