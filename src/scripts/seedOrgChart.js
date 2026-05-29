const db = require('../models');
const logger = require('../config/logger');

async function seedOrgChart() {
    try {
        await db.sequelize.authenticate();
        
        // Find the primary winery (assuming id 1)
        const winery = await db.Winery.findByPk(1);
        if (!winery) {
            throw new Error("Winery ID 1 not found. Make sure the database is seeded.");
        }

        logger.info("Clearing existing contacts for Winery ID 1...");
        await db.WineryContact.destroy({ where: { wineryId: 1 } });

        logger.info("Seeding realistic Org Chart...");

        // 1. General Manager (Executive)
        const gm = await db.WineryContact.create({
            wineryId: 1,
            name: "Jane Doe",
            role: "General Manager",
            email: "jane.doe@example.com",
            phone: "0412 345 678",
            layer: "Executive",
            responsibilities: "Overall business strategy, ultimate financial sign-off, high-level partnerships, and brand direction.",
            isActive: true
        });

        // 2. Winemaker (Production)
        const winemaker = await db.WineryContact.create({
            wineryId: 1,
            name: "John Smith",
            role: "Head Winemaker",
            email: "j.smith@example.com",
            layer: "Production",
            reportsToId: gm.id,
            responsibilities: "All winemaking activities, vineyard oversight, harvesting decisions, and barrel management.",
            isActive: true
        });

        // 3. Operations Manager (Operations)
        const opsManager = await db.WineryContact.create({
            wineryId: 1,
            name: "Sarah Parker",
            role: "Operations Manager",
            email: "sarah.p@example.com",
            phone: "0433 111 222",
            layer: "Operations",
            reportsToId: gm.id,
            responsibilities: "Logistics, bottling coordination, packaging supply chain, and facility maintenance.",
            isActive: true
        });

        // 4. Tasting Room Manager (Hospitality)
        const tastingManager = await db.WineryContact.create({
            wineryId: 1,
            name: "Tom Hughes",
            role: "Tasting Room Manager",
            email: "tom.hughes@example.com",
            layer: "Hospitality",
            reportsToId: opsManager.id,
            responsibilities: "Customer experience, staff scheduling, direct-to-consumer sales, and handling VIP guests.",
            isActive: true
        });

        // 5. Wine Club Coordinator (Hospitality)
        await db.WineryContact.create({
            wineryId: 1,
            name: "Emily Chen",
            role: "Wine Club Coordinator",
            email: "wineclub@example.com",
            layer: "Hospitality",
            reportsToId: tastingManager.id,
            responsibilities: "Managing wine club subscriptions, member allocations, dealing with failed payments, and exclusive events.",
            isActive: true
        });

        // 6. Vineyard Supervisor (Production)
        await db.WineryContact.create({
            wineryId: 1,
            name: "Marco Silva",
            role: "Vineyard Supervisor",
            layer: "Production",
            reportsToId: winemaker.id,
            responsibilities: "Day-to-day vineyard operations, pruning, disease management, and coordinating picking crews.",
            isActive: true
        });

        logger.info("Org Chart seeded successfully!");
        process.exit(0);

    } catch (err) {
        logger.error("Failed to seed Org Chart", err);
        process.exit(1);
    }
}

seedOrgChart();
