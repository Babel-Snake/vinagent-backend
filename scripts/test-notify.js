const notificationService = require('../src/services/notifications/notification.service');

async function test() {
    try {
        console.log('Testing Notification Service...');
        await notificationService.send({
            to: '+15550199',
            body: 'Hello from VinAgent Mock!',
            channel: 'sms'
        }, { wineryId: 1, memberId: 1 });
        console.log('✅ Send complete (check console for Mock output)');
        process.exit(0);
    } catch (e) {
        console.error('❌ Failed:', e);
        process.exit(1);
    }
}

test();
