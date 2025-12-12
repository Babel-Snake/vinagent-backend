const { Task, Winery } = require('../src/models');
const fs = require('fs');

async function debug() {
    try {
        const lines = [];
        lines.push('--- Debugging Tasks ---');
        const tasks = await Task.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            include: [{ model: Winery, as: 'winery' }]
        });

        if (tasks.length === 0) lines.push('No tasks found!');

        tasks.forEach(t => {
            lines.push(`Task #${t.id} | Status: ${t.status} | WineryID: ${t.wineryId} | WineryName: ${t.winery ? t.winery.name : 'NULL'} | Created: ${t.createdAt}`);
        });

        fs.writeFileSync('debug_output_2.txt', lines.join('\n'));
        process.exit(0);
    } catch (e) {
        fs.writeFileSync('debug_error.txt', 'Error: ' + e.message);
        process.exit(1);
    }
}

debug();
