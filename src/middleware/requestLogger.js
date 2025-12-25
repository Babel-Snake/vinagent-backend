const morgan = require('morgan');
const logger = require('../config/logger');

// Create a stream object with a 'write' function that will be used by morgan
const loggerStream = {
    write: (message) => {
        // Use the 'info' log level. 
        // Morgan adds a newline, so trim it.
        logger.info(message.trim());
    }
};

// Define custom token for masked URL (redact query params)
morgan.token('url-masked', (req) => {
    try {
        const url = new URL(req.originalUrl || req.url, 'http://dummy.com');
        return url.pathname + (url.search ? '?***masked***' : '');
    } catch (e) {
        return req.originalUrl || req.url;
    }
});

// Define custom token for request ID to allow correlation
morgan.token('id', (req) => req.id || '-');

// Format: TIMESTAMP ID METHOD URL STATUS SIZE - TIME ms
const requestLogger = morgan(
    ':date[iso] :id :method :url-masked :status :res[content-length] - :response-time ms',
    { stream: loggerStream }
);

module.exports = requestLogger;
