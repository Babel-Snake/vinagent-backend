
const fs = require('fs');
const { sequelize, CalendarEvent, Task, User } = require('../src/models');
const { Op } = require('sequelize');

function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/debug_fetch_log.txt', msg + '\n');
}

async function debugFetch() {
    log('Starting Fetch Debug...');
    try {
        await sequelize.authenticate();
        log('DB Connected');

        const wineryId = 1; // Assuming wineryId 1 for testing
        const start = new Date().toISOString();
        const end = new Date(new Date().getTime() + 86400000).toISOString(); // +1 day

        log(`Querying events for winery ${wineryId} between ${start} and ${end}`);

        // Replicating controller logic
        const where = { wineryId };
        where[Op.and] = [
            { start: { [Op.lte]: new Date(end) } },
            { end: { [Op.gte]: new Date(start) } }
        ];

        const events = await CalendarEvent.findAll({
            where,

            include: [
                { model: Task, as: 'LinkedTask', attributes: ['id', 'status', 'category', 'subType', 'priority'] },
                { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'] } // Note: 'Creator' alias must match model definition
            ],

            order: [['start', 'ASC']]
        });

        log(`Success! Found ${events.length} events.`);
        log(JSON.stringify(events, null, 2));

    } catch (err) {
        log('FETCH FAILED:');
        log(err.message);
        log(err.stack);
    } finally {
        await sequelize.close();
        setTimeout(() => process.exit(0), 500);
    }
}

debugFetch();
