const factory = require('../src/services/integrations/booking');

async function test() {
    try {
        console.log('Testing Booking Integration Factory...');
        const provider = await factory.getProvider(1); // Winery 1
        console.log('Provider instance:', provider.constructor.name);

        const result = await provider.createReservation({
            date: '2025-01-01',
            time: '18:00',
            pax: 2,
            firstName: 'Test',
            lastName: 'User'
        });
        console.log('Booking Result:', result);

        if (result.status === 'CONFIRMED' && result.referenceCode.startsWith('MOCK-')) {
            console.log('✅ Factory returned functional Mock provider.');
            process.exit(0);
        } else {
            throw new Error('Unexpected result from provider');
        }
    } catch (e) {
        console.error('❌ Failed:', e);
        process.exit(1);
    }
}

test();
