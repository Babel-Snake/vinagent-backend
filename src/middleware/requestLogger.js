const morgan = require('morgan');
const logger = require('../config/logger');

// Create a stream object with a 'write' function that will be used by morgan
const stream = {
    write: (message) => {
        // Use the 'info' log level
        logger.info(message.trim());
    },
};

// Custom token to mask query parameters
morgan.token('url-masked', (req) => {
    if (!req.originalUrl) return '';
    try {
        const [path, query] = req.originalUrl.split('?');
        if (!query) return path;
        return `${path}?***masked***`;
    } catch (e) {
        return req.originalUrl || '';
    }
});

// Use :url-masked instead of :url
const format = ':method :url-masked :status :res[content-length] - :response-time ms';

// Export the middleware
const requestLogger = morgan(format, { stream });

module.exports = requestLogger;
