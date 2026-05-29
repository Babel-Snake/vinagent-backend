require('dotenv').config();
const admin = require('../src/config/firebase');
const { User, Winery } = require('../src/models');

function readRequiredEnv(name, { minLength = 8 } = {}) {
    const value = process.env[name];
    if (!value || value.trim().length < minLength) {
        throw new Error(`${name} must be set and at least ${minLength} characters long.`);
    }
    return value.trim();
}

const SEED_PASSWORD = readRequiredEnv('SEED_USER_PASSWORD');

const USERS = [
    {
        email: 'manager@vinagent.com',
        role: 'manager',
        firstName: 'Mike',
        lastName: 'Manager',
        wineryId: 1
    },
    {
        email: 'sarah.w1@vinagent.internal',
        role: 'staff',
        firstName: 'Sarah',
        lastName: '',
        displayName: 'Sarah',
        wineryId: 1
    },
    {
        email: 'tom.w1@vinagent.internal',
        role: 'staff',
        firstName: 'Tom',
        lastName: '',
        displayName: 'Tom',
        wineryId: 1
    },
    {
        email: 'admin@vinagent.com',
        role: 'admin',
        firstName: 'Alice',
        lastName: 'Admin',
        wineryId: null
    }
];

async function seed() {
    console.log('Starting user seeding...');

    try {
        const [winery] = await Winery.findOrCreate({
            where: { id: 1 },
            defaults: {
                name: 'Demo Winery',
                timeZone: 'Australia/Adelaide'
            }
        });
        console.log(`Ensured winery: ${winery.name}`);

        for (const u of USERS) {
            console.log(`Processing ${u.email}...`);

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
                        displayName: u.displayName || `${u.firstName} ${u.lastName}`,
                        emailVerified: true
                    });
                    uid = newUser.uid;
                    console.log(`   - Created in Firebase (${uid})`);
                } else {
                    throw e;
                }
            }

            const [dbUser, created] = await User.findOrCreate({
                where: { email: u.email },
                defaults: {
                    firebaseUid: uid,
                    role: u.role,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    displayName: u.displayName || `${u.firstName} ${u.lastName}`,
                    wineryId: u.wineryId
                }
            });

            if (!created) {
                dbUser.role = u.role;
                dbUser.firebaseUid = uid;
                dbUser.wineryId = u.wineryId;
                await dbUser.save();
                console.log(`   - Updated in DB (${dbUser.role})`);
            } else {
                console.log(`   - Created in DB (${dbUser.role})`);
            }
        }

        console.log('Seeding complete.');
        console.log('Seed user password was read from SEED_USER_PASSWORD and was not printed.');
        process.exit(0);
    } catch (e) {
        console.error('Seeding failed:', e);
        process.exit(1);
    }
}

seed();
