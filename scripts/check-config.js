const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../check_config_v2.log');

function log(msg) {
    try {
        fs.appendFileSync(LOG_FILE, msg + '\n');
        console.log(msg);
    } catch (e) {
        // ignore
    }
}

async function check() {
    try {
        fs.writeFileSync(LOG_FILE, '--- Config Check Start ---\n');
    } catch (e) {
        console.error("Cannot write to log file");
        return;
    }

    try {
        // 1. Check Service Account
        const saPath = path.join(__dirname, '../src/config/serviceAccountKey.json');
        if (fs.existsSync(saPath)) {
            const sa = require(saPath);
            log(`ServiceAccount Present: YES`);
            log(`ServiceAccount ProjectID: ${sa.project_id}`);
        } else {
            log(`ServiceAccount Present: NO`);
        }

        // 2. Check Env
        require('dotenv').config();
        log(`Env FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID}`);
        log(`Env DB_HOST: ${process.env.DB_HOST}`);
        log(`Env DB_NAME: ${process.env.DB_NAME}`);
        log(`Env NODE_ENV: ${process.env.NODE_ENV}`);

        // 3. Check DB
        log('Checking DB Connection...');
        try {
            const { sequelize } = require('../src/models');
            await sequelize.authenticate();
            log('DB Connection: SUCCESS');

            // 4. Check User
            const { User } = require('../src/models');
            const userCount = await User.count();
            log(`DB User Count: ${userCount}`);

            const manager = await User.findOne({ where: { role: 'manager' } });
            if (manager) {
                log(`Manager Found: ${manager.email}`);
            } else {
                log('Manager NOT Found');
            }

        } catch (dbError) {
            log(`DB ERROR: ${dbError.message}`);
        }

    } catch (e) {
        log(`FATAL ERROR: ${e.message}`);
        log(e.stack);
    }

    log('--- Config Check End ---');
}

check();
