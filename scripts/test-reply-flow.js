const { Task, Member, Winery, Message } = require('../src/models');
const { executeTask } = require('../src/services/execution.service');
const notificationService = require('../src/services/notifications/notification.service');

// Mock Notification Service to avoid real calls (even though it has mock mode, simpler to spy if needed, but integration is better)
// We will rely on real service logic.

async function test() {
    try {
        console.log('--- Testing End-to-End Reply Flow ---');

        // 1. Setup Data
        const winery = await Winery.findOne({ where: { id: 1 } });
        if (!winery) throw new Error('Winery 1 not found. Run seeds.');

        const member = await Member.findOne({ where: { phone: '+15550199' } });
        if (!member) throw new Error('Member +15550199 not found. Run seeds.');

        // 2. Create Task (Manual)
        const task = await Task.create({
            wineryId: winery.id,
            memberId: member.id,
            status: 'PENDING_REVIEW',
            type: 'GENERAL_QUERY',
            subType: 'GENERAL_QUERY',
            category: 'GENERAL',
            suggestedChannel: 'sms',
            suggestedReplyBody: 'This is a test reply from the script.'
        });
        console.log(`Created Task #${task.id}`);

        // 3. Approve Task calls executeTask
        // We simulate what controller does:
        task.status = 'APPROVED';
        await task.save();

        const fakeSettings = { enableSecureLinks: true }; // Force enable
        console.log('Executing Task...');
        await executeTask(task, null, fakeSettings); // No transaction for test script simplicity

        console.log('✅ Execution Logic finished.');
        console.log('Check logs above for "[MOCK SMS]"');

        // Cleanup
        // await task.destroy();
        process.exit(0);
    } catch (e) {
        console.error('❌ Test Failed:', e);
        process.exit(1);
    }
}

test();
