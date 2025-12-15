require('dotenv').config();
const admin = require('../src/config/firebase'); // Backend Admin
const { initializeApp: initClient } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const axios = require('axios');
const { User } = require('../src/models');

// Client Config (from User)
const clientConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID
};

async function test() {
    try {
        console.log('--- Testing Firebase Auth Flow ---');

        // 1. Ensure Test User exists in Firebase (via Admin)
        const email = 'test.admin@vinagent.com';
        const password = 'TestPassword123!';
        let uid;

        try {
            const userRecord = await admin.auth().getUserByEmail(email);
            uid = userRecord.uid;
            console.log('Found existing Firebase user:', uid);
        } catch (e) {
            console.log('Creating new Firebase user...');
            const newUser = await admin.auth().createUser({
                email,
                password,
                emailVerified: true
            });
            uid = newUser.uid;
            console.log('Created Firebase user:', uid);
        }

        // 2. Ensure User exists in MySQL
        let dbUser = await User.findOne({ where: { email } });
        if (!dbUser) {
            console.log('Creating MySQL user map...');
            dbUser = await User.create({
                email,
                role: 'manager',
                firstName: 'Test',
                lastName: 'Admin',
                wineryId: 1 // Link to Winery 1
            });
        }
        console.log('MySQL User verify:', dbUser.id);

        // 3. Login via Client SDK (Simulate Frontend)
        console.log('Simulating Client Login...');
        const clientApp = initClient(clientConfig);
        const clientAuth = getAuth(clientApp);

        try {
            const cred = await signInWithEmailAndPassword(clientAuth, email, password);
            const idToken = await cred.user.getIdToken();
            console.log('✅ Obtained ID Token');

            // 4. Call Authenticated API
            console.log('Calling API /tasks with Token...');
            // Assuming local dev server is running on 3000? Or typically 3000 is default.
            // Wait, does this script run against the running server? 
            // The user hasn't started the server explicitly in a separate process that I can rely on staying up for this script *unless* I start it within the script or assume it's up.
            // Usually `npm test` starts a server.
            // I'll make a direct request to localhost:3000. If it fails, I might need to spawn the server.
            // Or I can mock the request/response flow using `supertest` with `src/app.js`?
            // Yes, let's use `supertest` to test the Express App directly without needing a separate process.
        } catch (authErr) {
            console.error('Client Login Failed:', authErr.code, authErr.message);
            throw authErr;
        }

    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    }
}

// Rewriting test to use Supertest for reliable testing
const request = require('supertest');
const app = require('../src/app');

async function testWithSupertest() {
    try {
        // ... (User setup code same as above) ...
        // Re-implementing User Setup to be safe
        const email = 'test.admin@vinagent.com';
        const password = 'TestPassword123!';

        // Initialize Admin if not already
        if (admin.apps.length === 0) {
            // handled by require
        }

        // 1. Firebase User
        try {
            await admin.auth().getUserByEmail(email);
        } catch {
            await admin.auth().createUser({ email, password });
        }

        // 2. DB User
        let dbUser = await User.findOne({ where: { email } });
        if (!dbUser) {
            await User.create({ email, role: 'manager', wineryId: 1 });
        }

        // 3. Client Login
        const clientApp = initClient(clientConfig, 'testClient'); // named app to avoid dupes?
        const clientAuth = getAuth(clientApp);
        const cred = await signInWithEmailAndPassword(clientAuth, email, password);
        const token = await cred.user.getIdToken();
        console.log('✅ Generated Token');

        // 4. API Request
        const res = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${token}`);

        console.log('API Status:', res.status);
        if (res.status === 200) {
            console.log('✅ Auth Middleware Verified! Tasks returned.');
            process.exit(0);
        } else {
            console.log('❌ API Failed:', res.body);
            process.exit(1);
        }

    } catch (e) {
        console.error('Test Error:', e);
        process.exit(1);
    }
}

testWithSupertest();
