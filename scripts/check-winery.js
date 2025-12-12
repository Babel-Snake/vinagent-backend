const { Winery } = require('../src/models');

async function main() {
    try {
        const wineries = await Winery.findAll();
        console.log('--- Wineries Found ---');
        if (wineries.length === 0) {
            console.log('No wineries found in DB.');
            // Create one for testing
            const newWinery = await Winery.create({
                name: 'Task Test Winery',
                contactPhone: '+15550100', // Default used in my simulator
                contactEmail: 'test@winery.com'
            });
            console.log('Created Default Winery:', newWinery.toJSON());
        } else {
            wineries.forEach(w => {
                console.log(`ID: ${w.id}, Name: ${w.name}, Phone: ${w.contactPhone}`);
            });
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
