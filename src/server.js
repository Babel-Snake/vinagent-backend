require('dotenv').config();
require('./config/telemetry');
const app = require('./app');
// Require models to trigger init/association
const db = require('./models');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Ensure DB is connected before handling traffic
    await db.sequelize.authenticate();
    // Validate that models are loaded
    if (Object.keys(db).length <= 2) { // sequelize + Sequelize
      logger.warn('Warning: No models appear to be loaded. Check src/models/index.js');
    }
    logger.info('Database connection established successfully.');

    app.listen(PORT, () => {
      logger.info(`VinAgent API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  }
}

startServer();
