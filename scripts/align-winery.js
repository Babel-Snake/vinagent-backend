const { Winery, Task, Member } = require('../src/models');
const { Op } = require('sequelize');

async function fix() {
    try {
        console.log('Aligning Winery ID 1...');

        // 1. Get Winery 1
        let w1 = await Winery.findByPk(1);
        if (!w1) {
            // Create if missing
            w1 = await Winery.create({
                id: 1,
                name: 'Task Test Winery',
                contactPhone: '+15550100',
                contactEmail: 'test@winery.com'
            });
            console.log('Created Winery 1');
        } else {
            // Update phone
            w1.contactPhone = '+15550100';
            await w1.save();
            console.log('Updated Winery 1 phone to +15550100');
        }

        // 2. Remove duplicates (Winery 2, etc created by seed-simulator)
        const others = await Winery.findAll({
            where: {
                contactPhone: '+15550100',
                id: { [Op.ne]: 1 }
            }
        });

        for (const w of others) {
            console.log(`Deleting duplicate winery ID ${w.id}...`);
            // Migrate tasks/members to ID 1 to verify?
            // For now, just delete to avoid confusion, or re-assign.
            // Better to re-assign tasks first so we don't lose the user's test data.
            await Task.update({ wineryId: 1 }, { where: { wineryId: w.id } });
            await Member.update({ wineryId: 1 }, { where: { wineryId: w.id } });
            await w.destroy();
        }

        console.log('✅ Alignment Complete. Frontend (Winery 1) should now see tasks.');
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fix();
