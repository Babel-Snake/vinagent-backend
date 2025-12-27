const logger = require('../config/logger');

/**
 * Valid statuses for ingestion metrics
 */
const STATUS = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    DUPLICATE: 'DUPLICATE',
    PARTIAL: 'PARTIAL'
};

/**
 * Records an ingestion event with performance metrics.
 * @param {string} source - 'sms', 'email', 'voice'
 * @param {string} status - SUCCESS, FAILURE, DUPLICATE
 * @param {number} durationMs - Execution time in milliseconds
 * @param {Object} meta - Additional metadata (error code, messageId, etc.)
 */
function recordIngestion(source, status, durationMs, meta = {}) {
    logger.info('Metric: Ingestion', {
        metric: 'ingestion_event',
        source,
        status,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        ...meta
    });
}

/**
 * records Triage performance.
 */
function recordTriage(source, category, durationMs) {
    logger.info('Metric: Triage', {
        metric: 'triage_event',
        source,
        category,
        duration_ms: durationMs
    });
}

/**
 * Records a DLQ or dropped message event.
 */
function recordDroppedMessage(source, reason, rawSnippet) {
    logger.error('Metric: Dropped Message', {
        metric: 'dropped_message',
        source,
        reason,
        raw_snippet: rawSnippet ? rawSnippet.substring(0, 100) : ''
    });
}

module.exports = {
    recordIngestion,
    recordTriage,
    recordDroppedMessage,
    STATUS
};
