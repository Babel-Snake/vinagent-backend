const { sequelize } = require('../src/config/db');
const { User, Task, Notification } = require('../src/models');
const taskService = require('../src/services/taskService');

async function testMentions() {
    try {
        console.log('--- Starting Mention Test ---');

        // 1. Setup Users
        const users = await User.findAll({ limit: 2 });
        if (users.length < 2) {
            console.log('Not enough users to test.');
            return;
        }
        const sender = users[0];
        const receiver = users[1];

        // Ensure receiver has a display name
        if (!receiver.displayName) {
            receiver.displayName = 'TestReceiver';
            await receiver.save();
        }

        console.log(`Sender: ${sender.displayName} (${sender.id})`);
        console.log(`Receiver: ${receiver.displayName} (${receiver.id})`);

        // 2. Create a Task
        const task = await Task.create({
            wineryId: sender.wineryId,
            createdBy: sender.id,
            title: 'Test Task',
            status: 'PENDING_REVIEW',
            payload: {} // Add empty payload to satisfy constraints if any
        });
        console.log(`Task created: ${task.id}`);

        // 3. Update Task with Mention
        // Using @DisplayName format
        const note = `Hey @${receiver.displayName}, please check this out.`;
        console.log(`Adding note: "${note}"`);

        await taskService.updateTask({
            taskId: task.id,
            wineryId: sender.wineryId,
            userId: sender.id,
            userRole: 'manager',
            updates: {
                notes: note
            }
        });

        // 4. Verify Notification
        const notifications = await Notification.findAll({
            where: { userId: receiver.id }
        });

        const match = notifications.find(n => n.type === 'MENTION' && n.data.taskId === task.id);

        if (match) {
            console.log('SUCCESS: Notification found!');
            console.log(match.toJSON());
        } else {
            console.error('FAILURE: No notification found for receiver.');
            console.log('Found notifications:', notifications.map(n => n.message));
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await sequelize.close();
    }
}

testMentions();
