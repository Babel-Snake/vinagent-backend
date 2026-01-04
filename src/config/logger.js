// src/config/logger.js
// Thin wrapper around winston so we can swap or adjust later.

const { createLogger, format, transports } = require('winston');
const logLevel = process.env.LOG_LEVEL || 'info';

const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console()
  ]
});

module.exports = logger;
