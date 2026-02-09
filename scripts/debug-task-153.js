require('dotenv').config();
const fs = require('fs');
fs.writeFileSync('debug_start.txt', 'Script started\n');

const { sequelize, Task, TaskAction, User, Member, Message } = require('../src/models');

async function debugTask153() {
    try {
        fs.appendFileSync('debug_start.txt', 'Connecting to DB...\n');
        await sequelize.authenticate();
        fs.appendFileSync('debug_start.txt', 'Connected.\n');

        const taskId = 153;
        console.log(`Fetching Task ${taskId}...`);

        const task = await Task.findOne({
            where: { id: taskId },
            include: [
                { model: Member },
                { model: Message },
                { model: User, as: 'Creator', attributes: ['id', 'displayName'] },
                {
                    model: TaskAction,
                    separate: true,
                    order: [['createdAt', 'ASC']],
                    include: [{ model: User, attributes: ['id', 'displayName', 'role'] }]
                }
            ]
        });

        if (!task) {
            console.log('Task not found in DB.');
            process.exit(0);
        }

        console.log('Task found.');

        // Serialize to check for circular refs or size
        const json = JSON.stringify(task.toJSON(), null, 2);
        console.log(`JSON Length: ${json.length} chars`);

        require('fs').writeFileSync('debug_153.txt', json);
        console.log('Wrote output to debug_153.txt');

        process.exit(0);
    } catch (err) {
        console.error('Debug failed:', err);
        process.exit(1);
    }
}

debugTask153();
