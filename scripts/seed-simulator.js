const { Winery, Member } = require('../src/models');

async function seed() {
    try {
        console.log('Seeding Simulator Data...');

        // 1. Ensure Winery Exists
        const [winery, created] = await Winery.findOrCreate({
            where: { contactPhone: '+15550100' },
            defaults: {
                name: 'Simulator Winery',
                contactEmail: 'sim@example.com'
            }
        });
        console.log(created ? '✅ Created Simulator Winery' : 'ℹ️  Simulator Winery already exists');

        // 2. Ensure Member Exists (for member testing)
        // User A: +15550199
        await Member.findOrCreate({
            where: { phone: '+15550199', wineryId: winery.id },
            defaults: {
                firstName: 'Sim',
                lastName: 'User',
                email: 'sim.user@example.com',
                status: 'active'
            }
        });
        console.log('✅ Ensured Sim User (+15550199) exists');

        console.log('--- Setup Complete ---');
        console.log('You can now run: node scripts/simulate-sms.js');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
