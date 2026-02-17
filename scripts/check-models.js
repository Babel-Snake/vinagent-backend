
const fs = require('fs');
const path = require('path');


function log(msg) {
    fs.appendFileSync('C:/Users/pc/.gemini/antigravity/brain/2b61ae92-097f-4d68-9750-3aad4e48cd50/check_models_log.txt', msg + '\n');
}


log('Script started');
try {
    require('dotenv').config();
    log('Dotenv loaded');

    log('Requiring models...');
    const { sequelize } = require('../src/models');
    log('Models required');

    async function checkModels() {
        try {
            log('Authenticating...');
            await sequelize.authenticate();
            log('DB Connected');
            log('Loaded Models: ' + Object.keys(sequelize.models).join(', '));
        } catch (err) {
            log('Check Failed: ' + err.message);
        } finally {
            log('Closing DB...');
            await sequelize.close();
            // Force exit to ensure flush
            setTimeout(() => process.exit(0), 500);
        }
    }

    checkModels();
} catch (err) {
    log('Top-level Error: ' + err.message);
}
