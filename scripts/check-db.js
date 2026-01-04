require('dotenv').config();
const { Task, User } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function check() {
    try {
        const taskCount = await Task.count();
        const userCount = await User.count();
        const tasks = await Task.findAll({
            limit: 3,
            include: ['Assignee'],
            order: [['createdAt', 'DESC']]
        });

        const output = [
            `Task Count: ${taskCount}`,
            `User Count: ${userCount}`,
            '--- Recent Tasks ---',
            ...tasks.map(t => `Task #${t.id} (${t.type}) - Assignee: ${t.Assignee ? t.Assignee.displayName : 'None'}`)
        ].join('\n');

        fs.writeFileSync(path.join(__dirname, '..', 'db_check_result.txt'), output);
        console.log('Check complete');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync(path.join(__dirname, '..', 'db_check_result.txt'), `Error: ${err.message}\n${err.stack}`);
        process.exit(1);
    }
}

check();
