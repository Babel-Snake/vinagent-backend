const axios = require('axios'); // Requires 'npm install axios' or use native fetch if Node 18+
const readline = require('readline');

// Config
const API_URL = 'http://localhost:3000/api/webhooks/sms';
const MOCKED_PHONE_NUMBER = '+15550199'; // Simulating 'User A'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('============================================');
console.log('🍷 VinAgent SMS Simulator');
console.log('============================================');
console.log(`Target: ${API_URL}`);
console.log(`Simulating Sender: ${MOCKED_PHONE_NUMBER}`);
console.log('Type a message and press ENTER to send.');
console.log('Type "exit" to quit.');
console.log('--------------------------------------------');

const prompt = () => {
    rl.question('You: ', async (body) => {
        if (body.trim().toLowerCase() === 'exit') {
            console.log('Goodbye!');
            rl.close();
            return;
        }

        try {
            // Emulate Twilio Webhook payload
            // Twilio sends: simple form-urlencoded usually, but we accept JSON in our controller?
            // Let's check controller. If it expects req.body.Body/From etc.

            // Assuming the controller handles standard body parsing:
            const payload = {
                Body: body,
                From: MOCKED_PHONE_NUMBER,
                To: '+15550100'
            };

            const startTime = Date.now();
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const duration = Date.now() - startTime;

            if (response.ok) {
                const data = await response.text(); // Twilio returns XML usually
                console.log(`[VinAgent replied in ${duration}ms]: \n${data}`);
                console.log('✅ Message processed. Check Dashboard for new Task.\n');
            } else {
                console.error(`❌ Error ${response.status}: ${await response.text()}`);
            }

        } catch (err) {
            console.error('❌ Network Error:', err.message);
            if (err.cause) console.error(err.cause);
        }

        prompt();
    });
};

// Check if fetch is available (Node 18+)
if (!global.fetch) {
    console.warn('⚠️  Global fetch not found. Please run with Node 18+ or install node-fetch/axios.');
    console.warn('Attempting to continue... (might crash)');
}

prompt();
