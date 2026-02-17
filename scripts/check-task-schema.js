
const fs = require('fs');
const { sequelize } = require('../src/models');

function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/check_task_schema_log.txt', msg + '\n');
}

async function checkTaskSchema() {
    try {
        log('Authenticating...');
        await sequelize.authenticate();
        log('DB Connected');
        log('Checking Tasks table...');
        const desc = await sequelize.getQueryInterface().describeTable('Tasks');
        log('Tasks Schema Columns: ' + JSON.stringify(Object.keys(desc)));
        log('Full Schema: ' + JSON.stringify(desc, null, 2));
    } catch (err) {
        log('Schema Check Failed: ' + err.message);
    } finally {
        await sequelize.close();
        setTimeout(() => process.exit(0), 500);
    }
}

checkTaskSchema();
