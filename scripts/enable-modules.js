require('dotenv').config();
const { WinerySettings } = require('../src/models');

async function fixWinerySettings() {
    try {
        console.log('Fetching Winery 1 Settings...');
        let [settings, created] = await WinerySettings.findOrCreate({
            where: { wineryId: 1 },
            defaults: {
                tier: 'ADVANCED',
                enableBookingModule: true,
                enableWineClubModule: true,
                enableOrdersModule: true
            }
        });

        console.log('Settings found/created. Updating flags...');
        settings.enableWineClubModule = true;
        settings.enableOrdersModule = true;
        settings.enableBookingModule = true;
        await settings.save();

        console.log('✅ Winery 1 is now fully enabled for all modules (Orders, Wine Club, Booking).');
    } catch (e) {
        console.error('Error updating winery settings:', e);
    }
}

fixWinerySettings();
