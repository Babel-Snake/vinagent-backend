const { sequelize } = require('../src/models');

async function sync() {
    try {
        console.log('Syncing database...');
        // Use alter: true to update schema without data loss
        await sequelize.sync({ alter: true });
        console.log('Database synced successfully.');

        // Check tables now
        const tables = await sequelize.getQueryInterface().showAllTables();
        console.log('Tables:', tables);
    } catch (err) {
        console.error('Sync failed:', err);
    } finally {
        process.exit(0);
    }
}

sync();
