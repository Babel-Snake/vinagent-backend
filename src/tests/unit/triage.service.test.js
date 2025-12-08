const triageService = require('../../services/triage.service');

describe('Triage Service', () => {
    describe('triageMessage', () => {
        it('should classify "address" as ADDRESS_CHANGE', async () => {
            const result = await triageService.triageMessage({ body: 'I need to update my address' });
            expect(result.type).toBe('ADDRESS_CHANGE');
        });

        it('should classify "payment" or "card" as PAYMENT_ISSUE', async () => {
            let result = await triageService.triageMessage({ body: 'My card expired' });
            expect(result.type).toBe('PAYMENT_ISSUE');

            result = await triageService.triageMessage({ body: 'payment failed' });
            expect(result.type).toBe('PAYMENT_ISSUE');
        });

        it('should classify "book" or "tasting" as BOOKING_REQUEST', async () => {
            const result = await triageService.triageMessage({ body: 'Can I book a tasting?' });
            expect(result.type).toBe('BOOKING_REQUEST');
        });

        it('should classify "delivery" or "shipping" as DELIVERY_ISSUE', async () => {
            const result = await triageService.triageMessage({ body: 'Where is my delivery?' });
            expect(result.type).toBe('DELIVERY_ISSUE');
        });

        it('should switch to GENERAL_QUERY for unknown intent', async () => {
            const result = await triageService.triageMessage({ body: 'Hello there' });
            expect(result.type).toBe('GENERAL_QUERY');
        });

        it('should handle empty body safely', async () => {
            const result = await triageService.triageMessage({ body: null });
            expect(result.type).toBe('GENERAL_QUERY');
        });
    });
});
