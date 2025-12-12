const { Task, Member, Winery } = require('../src/models');
const { executeTask } = require('../src/services/execution.service');
const bookingFactory = require('../src/services/integrations/booking');

async function test() {
    try {
        console.log('--- Testing Booking Execution Flow ---');

        // 1. Setup Data
        const winery = await Winery.findOne({ where: { id: 1 } });
        const member = await Member.findOne({ where: { phone: '+15550199' } });
        if (!winery || !member) throw new Error('Missing seed data');

        // 2. Create Task with Booking Payload
        const task = await Task.create({
            wineryId: winery.id,
            memberId: member.id,
            status: 'PENDING_REVIEW',
            type: 'BOOKING',
            subType: 'BOOKING_NEW',
            category: 'BOOKING',
            payload: {
                date: '2025-05-20',
                time: '19:30',
                pax: 4,
                notes: 'Test booking from script'
            },
            suggestedChannel: 'sms',
            suggestedReplyBody: 'We have confirmed your table.'
        });
        console.log(`Created Booking Task #${task.id}`);

        // 3. Mock Settings (Enable Secure Links to pass verify check)
        const fakeSettings = { enableSecureLinks: true };
        // Note: In real app, settings loaded from DB. Here we pass fake to skip DB lookup of settings if logic allows, 
        // OR we ensure DB has settings.
        // The service logic: if (!settings) load from DB.
        // Let's rely on built-in logic. Ensure Winery 1 has settings?
        // We generated migration but default is enableSecureLinks: false. 
        // So we might get "Skipped".
        // Let's force update the task object to have settings attached? No, service doesn't work that way.
        // We will pass settings explicitly to executeTask.

        console.log('Executing Booking Task...');
        await executeTask(task, null, fakeSettings);

        // 4. Verification
        await task.reload(); // Get updated fields
        console.log('Task Status:', task.status);
        console.log('Payload:', task.payload);
        console.log('Reply Body:', task.suggestedReplyBody);

        if (task.status === 'EXECUTED' && task.payload.bookingReference) {
            console.log('✅ Booking Execution Successful!');
            process.exit(0);
        } else {
            console.error('❌ Failed: Task not executed or missing reference.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Test Failed:', e);
        process.exit(1);
    }
}

test();
