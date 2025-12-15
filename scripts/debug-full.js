require('dotenv').config();
const { User, Winery, Task } = require('../src/models');
const admin = require('../src/config/firebase'); // For Auth check if needed
const request = require('supertest');
const app = require('../src/app');
const { initializeApp: initClient } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Client Config (Manual again, just to be safe)
const clientConfig = {
    apiKey: "AIzaSyA8ntqj81rLMP_QTBH8r7npRpf6MtI2uPY",
    authDomain: "vinagent-9f2e4.firebaseapp.com",
    projectId: "vinagent-9f2e4",
    storageBucket: "vinagent-9f2e4.firebasestorage.app",
    messagingSenderId: "972788381246",
    appId: "1:972788381246:web:0b7cc5e277b671045d036f"
};

async function debug() {
    console.log('🔍 Starting Debug Session...');

    try {
        // 1. Check Winery
        const winery = await Winery.findByPk(1);
        console.log('\nWinery #1:', winery ? winery.toJSON() : 'NOT FOUND');

        // 2. Check Users
        const users = await User.findAll({ where: { wineryId: 1 } });
        console.log(`\nUsers linked to Winery #1: ${users.length}`);
        users.forEach(u => console.log(` - [${u.id}] ${u.email} (${u.role})`));

        // 3. Check Tasks
        const tasks = await Task.findAll({ where: { wineryId: 1 } });
        console.log(`\nTasks linked to Winery #1: ${tasks.length}`);
        if (tasks.length > 0) {
            console.log('Sample Task:', tasks[0].toJSON());
        } else {
            // Check if there are tasks with NULL winery?
            const orphans = await Task.findAll({ where: { wineryId: null } });
            console.log(`Orphan Tasks (No Winery): ${orphans.length}`);
        }

        // 4. Simulate API Call
        console.log('\n🔐 Simulating Login & API Fetch...');

        // Init Client
        const clientApp = initClient(clientConfig, 'debugClient');
        const clientAuth = getAuth(clientApp);

        try {
            const cred = await signInWithEmailAndPassword(clientAuth, 'manager@vinagent.com', 'Password123!');
            const token = await cred.user.getIdToken();
            console.log('✅ Login Successful. Token obtained.');

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', `Bearer ${token}`);

            console.log(`\nAPI Response: ${res.status}`);
            if (res.status !== 200) {
                console.error('❌ Error Body:', JSON.stringify(res.body, null, 2));
            } else {
                console.log(`✅ Success! Fetched ${res.body.tasks.length} tasks.`);
            }

        } catch (authErr) {
            console.error('❌ Auth Failed:', authErr.code, authErr.message);
        }

    } catch (e) {
        console.error('Debug Script Crashed:', e);
    } finally {
        process.exit(0);
    }
}

debug();
