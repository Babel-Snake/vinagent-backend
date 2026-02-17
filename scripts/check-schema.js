
const { sequelize } = require('../src/models');


const fs = require('fs');

function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/check_schema_log.txt', msg + '\n');
}

async function checkSchema() {
    try {
        log('Authenticating...');
        await sequelize.authenticate();
        log('DB Connected');
        log('Checking CalendarEvents table...');
        const desc = await sequelize.getQueryInterface().describeTable('CalendarEvents');
        log('CalendarEvents Schema Found: ' + JSON.stringify(Object.keys(desc)));
    } catch (err) {
        log('Schema Check Failed: ' + err.message);
    } finally {
        await sequelize.close();
        setTimeout(() => process.exit(0), 500);
    }
}

checkSchema();

