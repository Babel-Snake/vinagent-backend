const factory = require('../src/services/integrations/crm');

async function test() {
    try {
        console.log('Testing CRM Integration Factory...');
        const provider = await factory.getProvider(1);

        console.log('Searching for member...');
        const member = await provider.getMember({ phone: '+15550199' });
        console.log('Found Member:', member);

        if (member && member.id === 'crm-mock-12345') {
            console.log('✅ Factory returned functional Mock CRM.');

            await provider.addNote(member.id, 'Interaction logged via VinAgent');
            process.exit(0);
        } else {
            throw new Error('Member not found or ID mismatch');
        }
    } catch (e) {
        console.error('❌ Failed:', e);
        process.exit(1);
    }
}

test();
