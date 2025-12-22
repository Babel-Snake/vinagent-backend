require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./config/db');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Ensure DB is connected before handling traffic
    await sequelize.authenticate();
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
