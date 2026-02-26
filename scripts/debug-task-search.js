
const fs = require('fs');
const { sequelize, User, Task } = require('../src/models');
const taskService = require('../src/services/taskService');

function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/debug_search_log.txt', msg + '\n');
}

async function debugSearch() {
    log('Starting Search Debug...');
    try {
        await sequelize.authenticate();
        log('DB Connected');

        const user = await User.findOne();
        if (!user) throw new Error('No user found');
        log(`Using User: ${user.id} Winery: ${user.wineryId}`);

        // Ensure we have a known task
        const task = await Task.findOne({ where: { wineryId: user.wineryId } });
        if (!task) {
            throw new Error('No tasks found to test search with');
        }
        log(`Testing with Task ID: ${task.id}, Category: ${task.category}, SubType: ${task.subType}`);

        // Test 1: Search by ID
        log(`--- SEARCH BY ID: ${task.id} ---`);
        const resId = await taskService.getTasksForWinery({
            wineryId: user.wineryId,
            userId: user.id,
            userRole: user.role,
            filters: { search: task.id.toString() }
        });
        log(`Found ${resId.tasks.length} tasks. First ID: ${resId.tasks[0]?.id}`);

        // Test 2: Search by Category (if exists)
        if (task.category) {
            log(`--- SEARCH BY CATEGORY: ${task.category} ---`);
            const resCat = await taskService.getTasksForWinery({
                wineryId: user.wineryId,
                userId: user.id,
                userRole: user.role,
                filters: { search: task.category }
            });
            log(`Found ${resCat.tasks.length} tasks.`);
            log(`First 3 IDs: ${resCat.tasks.slice(0, 3).map(t => t.id).join(', ')}`);
        }

        // Test 3: Search by random text (should match nothing)
        log(`--- SEARCH BY RANDOM: XYZ999 ---`);
        const resRand = await taskService.getTasksForWinery({
            wineryId: user.wineryId,
            userId: user.id,
            userRole: user.role,
            filters: { search: 'XYZ999' }
        });
        log(`Found ${resRand.tasks.length} tasks.`);

    } catch (err) {
        log('SEARCH FAILED:');
        log(err.message);
        log(err.stack);
    } finally {
        await sequelize.close();
        setTimeout(() => process.exit(0), 1000);
    }
}

debugSearch();
