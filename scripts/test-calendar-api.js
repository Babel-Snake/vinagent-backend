

require('dotenv').config();
const { sequelize } = require('../src/models');

const request = require('supertest');
const app = require('../src/app'); // Assuming app is exported from app.js


const fs = require('fs');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('d:/Projects/Vinagent2/vinagent-backend/test-result.txt', msg + '\n');
}

async function testCalendar() {
    log('Starting test...');
    try {
        log('Authenticating DB...');
        await sequelize.authenticate();
        log('DB Connected');



        // Simulate a request with a valid-looking but dummy token, 
        // OR modifying the app to mock auth for testing is harder. 
        // Let's rely on the 403. If it returns 403, the route exists and is protected.
        // If it returns 500/404, we have a problem.

        // Actually, let's try to bypass auth in the test by setting a test user on the request object? 
        // No, we can't easily do that with supertest without modifying middleware.
        // Let's just create a test token or just check key routes.

        const res = await request(app)
            .get('/api/calendar')
            .query({ start: new Date().toISOString(), end: new Date().toISOString() });



        log('Status: ' + res.status);
        log('Body: ' + JSON.stringify(res.body, null, 2));
        if (res.error) {
            log('Error: ' + res.error);
        }

    } catch (err) {
        log('Test Failed: ' + err);
    } finally {
        await sequelize.close();
        // Give time for logs to flush if needed
        setTimeout(() => process.exit(0), 1000);
    }
}


testCalendar();
