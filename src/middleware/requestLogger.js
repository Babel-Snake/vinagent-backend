const morgan = require('morgan');
const logger = require('../config/logger');

// Create a stream object with a 'write' function that will be used by morgan
const stream = {
    write: (message) => {
        // Use the 'info' log level so the output will be picked up by both transports (file and console)
        logger.info(message.trim());
    },
};

// Morgan format string (avoid query params to prevent leaking tokens)
const format = ':method :path :status :res[content-length] - :response-time ms';

// Export the middleware
const requestLogger = morgan(format, { stream });

module.exports = requestLogger;
