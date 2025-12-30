// src/config/telemetry.js
// Basic APM setup for production observability
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const logger = require('./logger');

// Only enable in production or if explicitly requested
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TELEMETRY === 'true') {
    try {
        const sdk = new NodeSDK({
            instrumentations: [getNodeAutoInstrumentations()]
        });

        sdk.start();
        logger.info('OpenTelemetry SDK started');
    } catch (err) {
        logger.error('Failed to start OpenTelemetry SDK', err);
    }
}

module.exports = {};
