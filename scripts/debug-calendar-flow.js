
const fs = require('fs');
const { sequelize, CalendarEvent, Task, User } = require('../src/models');
const { Op } = require('sequelize');

function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/debug_flow_log.txt', msg + '\n');
}

async function debugFlow() {
    log('Starting Calendar Flow Debug...');
    try {
        await sequelize.authenticate();
        log('DB Connected');


        // 0. Find a valid User and Winery
        const user = await User.findOne();
        if (!user) throw new Error('No users found in DB');
        const wineryId = user.wineryId;
        log(`Using User: ${user.id}, Winery: ${wineryId}`);

        // 1. Create a dummy Task to link
        const task = await Task.create({
            category: 'INTERNAL',
            status: 'PENDING_REVIEW',
            wineryId: wineryId,
            subType: 'DEBUG_TEST'
        });
        log('Created Debug Task: ' + task.id);

        // 2. Create Calendar Event linked to it
        const event = await CalendarEvent.create({
            title: 'Debug Event',
            start: new Date(),
            end: new Date(new Date().getTime() + 3600000),
            wineryId: wineryId,
            createdBy: user.id,
            taskId: task.id,
            type: 'meeting'
        });

        log('Created Calendar Event: ' + event.id);

        // 3. Try to Fetch it (Replicating Controller Logic)
        const where = { wineryId: 1 };
        const events = await CalendarEvent.findAll({
            where,

            include: [
                { model: Task, as: 'LinkedTask', attributes: ['id', 'status', 'category', 'subType', 'priority'] },
                { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'] }
            ],

            order: [['start', 'ASC']]
        });

        log(`Fetched ${events.length} events.`);
        const fetchedEvent = events.find(e => e.id === event.id);
        if (fetchedEvent) {
            const linked = fetchedEvent.LinkedTask;
            log('Linked Task Data: ' + JSON.stringify(linked));
            if (linked && !linked.title && linked.category) {
                log('Verification Success: LinkedTask has category without title.');
            }
        } else {
            log('Event not found in fetch!');
        }

        // Cleanup
        await event.destroy();
        await task.destroy();

    } catch (err) {
        log('FLOW FAILED:');
        log(err.message);
        log(err.stack);
    } finally {
        await sequelize.close();
        setTimeout(() => process.exit(0), 1000);
    }
}

debugFlow();
