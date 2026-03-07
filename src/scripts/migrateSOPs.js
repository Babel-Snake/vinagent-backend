require('dotenv').config();
const { Winery, WineryPolicyProfile, WinerySop } = require('../models');

async function migrate() {
    try {
        console.log('Starting SOP migration...');
        const wineries = await Winery.findAll({
            include: [{ model: WineryPolicyProfile, as: 'policyProfile' }]
        });

        for (const winery of wineries) {
            console.log(`Processing Winery ID: ${winery.id}`);

            // Check if SOPs already exist
            const existingSops = await WinerySop.count({ where: { wineryId: winery.id } });
            if (existingSops > 0) {
                console.log(`Winery ${winery.id} already has SOPs, skipping...`);
                continue;
            }

            const profile = winery.policyProfile || {};

            const sopsToCreate = [
                {
                    wineryId: winery.id,
                    title: 'Shipping Timeframes',
                    body: profile.shippingTimeframesText || 'Standard shipping takes 3-5 business days. Express shipping is 1-2 business days.'
                },
                {
                    wineryId: winery.id,
                    title: 'Returns & Refunds',
                    body: profile.returnsRefundsPolicyText || 'We accept returns within 30 days of purchase for unopened bottles.'
                },
                {
                    wineryId: winery.id,
                    title: 'Wine Club Summary',
                    body: profile.wineClubSummary || 'Join our wine club to receive exclusive discounts, early access to new releases, and free shipping on orders over $150.'
                }
            ];

            await WinerySop.bulkCreate(sopsToCreate);
            console.log(`Created default SOPs for Winery ${winery.id}`);
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
