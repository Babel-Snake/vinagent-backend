require('dotenv').config();
const admin = require('../src/config/firebase');
const { User, Winery } = require('../src/models');

async function debug() {
    console.log('🔍 Debugging Users & Winery Config...\n');

    try {
        // 1. Check Manager
        console.log('--- Manager Check ---');
        const managerEmail = 'manager@vinagent.com';
        const managerDB = await User.findOne({
            where: { email: managerEmail },
            include: [{ model: Winery }]
        });

        if (managerDB) {
            console.log(`✅ [DB] Manager Found: ID=${managerDB.id}, WineryID=${managerDB.wineryId}, WineryName=${managerDB.Winery?.name}`);
        } else {
            console.error('❌ [DB] Manager NOT FOUND');
        }

        // 2. Check Sarah
        console.log('\n--- Staff (Sarah) Check ---');
        // We expect wineryId to be the manager's wineryId (likely 1)
        const targetWineryId = managerDB ? managerDB.wineryId : 1;
        const sarahEmail = `sarah.w${targetWineryId}@vinagent.internal`;

        console.log(`Target Email: ${sarahEmail}`);

        // Firebase Check
        try {
            const fbUser = await admin.auth().getUserByEmail(sarahEmail);
            console.log(`✅ [Firebase] User Exists! UID=${fbUser.uid}`);
        } catch (e) {
            console.error(`❌ [Firebase] User Lookup Failed: ${e.code}`);
        }

        // DB Check
        const sarahDB = await User.findOne({ where: { email: sarahEmail } });
        if (sarahDB) {
            console.log(`✅ [DB] User Found: ID=${sarahDB.id}, Role=${sarahDB.role}, WineryID=${sarahDB.wineryId}`);
        } else {
            console.error('❌ [DB] User NOT FOUND');
        }

    } catch (e) {
        console.error('Debug failed:', e);
    }
    process.exit(0);
}

debug();
