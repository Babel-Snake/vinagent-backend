require('dotenv').config();
const admin = require('../src/config/firebase');
const { User, Winery } = require('../src/models');

const SEED_PASSWORD = 'Password123!';

const USERS = [
    {
        email: 'manager@vinagent.com',
        role: 'manager',
        firstName: 'Mike',
        lastName: 'Manager',
        wineryId: 1
    },
    {
        email: 'staff@vinagent.com',
        role: 'staff',
        firstName: 'Sarah',
        lastName: 'Staff',
        wineryId: 1
    },
    {
        email: 'admin@vinagent.com',
        role: 'admin',
        firstName: 'Alice',
        lastName: 'Admin',
        wineryId: null // Global Admin
    }
];

async function seed() {
    console.log('🌱 Starting User Seeding...');

    try {
        // Ensure Winery 1 exists
        const [winery] = await Winery.findOrCreate({
            where: { id: 1 },
            defaults: {
                name: 'Demo Winery',
                timeZone: 'Australia/Adelaide'
            }
        });
        console.log(`✅ Ensured Winery: ${winery.name}`);

        for (const u of USERS) {
            console.log(`Processing ${u.email}...`);

            // 1. Firebase Auth
            let uid;
            try {
                const userRecord = await admin.auth().getUserByEmail(u.email);
                uid = userRecord.uid;
                console.log(`   - Found in Firebase (${uid})`);
            } catch (e) {
                if (e.code === 'auth/user-not-found') {
                    const newUser = await admin.auth().createUser({
                        email: u.email,
                        password: SEED_PASSWORD,
                        displayName: `${u.firstName} ${u.lastName}`,
                        emailVerified: true
                    });
                    uid = newUser.uid;
                    console.log(`   - Created in Firebase (${uid})`);
                } else {
                    throw e;
                }
            }

            // 2. MySQL DB
            const [dbUser, created] = await User.findOrCreate({
                where: { email: u.email },
                defaults: {
                    firebaseUid: uid,
                    role: u.role,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    wineryId: u.wineryId
                }
            });

            if (!created) {
                // Update key fields ensuring sync
                dbUser.role = u.role;
                dbUser.firebaseUid = uid;
                dbUser.wineryId = u.wineryId;
                await dbUser.save();
                console.log(`   - Updated in DB (${dbUser.role})`);
            } else {
                console.log(`   - Created in DB (${dbUser.role})`);
            }
        }

        console.log('✅ Seeding Complete.');
        console.log(`\ncredentials:\nDefault Password: ${SEED_PASSWORD}`);
        process.exit(0);

    } catch (e) {
        console.error('❌ Seeding Failed:', e);
        process.exit(1);
    }
}

seed();
