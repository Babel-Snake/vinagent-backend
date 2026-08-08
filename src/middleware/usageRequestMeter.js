const logger = require('../config/logger');
const { incrementUsageCounter } = require('../services/usageTracking.service');
const { METRICS, ROUTE_GROUPS } = require('../services/usageMetricCatalog');

function routeGroupFor(req) {
  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  const segments = pathname.split('/').filter(Boolean);
  const candidate = segments[0] === 'api' ? segments[1] : segments[0];
  return ROUTE_GROUPS.has(candidate) ? candidate : 'other';
}

function usageRequestMeter(req, res, next) {
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    if (!req.user?.wineryId) return;
    if (process.env.NODE_ENV === 'test' && process.env.USAGE_REQUEST_METER_IN_TEST !== 'true') return;
    const elapsedNs = process.hrtime.bigint() - started;
    const durationMs = Number(elapsedNs) / 1e6;
    const responseBytes = Math.max(Number(res.getHeader('content-length')) || 0, 0);
    incrementUsageCounter({
      wineryId: req.user.wineryId,
      metricKey: METRICS.API_REQUESTS,
      dimensions: {
        routeGroup: routeGroupFor(req),
        method: String(req.method || 'GET').toUpperCase(),
        statusClass: `${Math.floor(Number(res.statusCode || 500) / 100)}xx`,
        role: req.user.role || 'unknown',
        authMode: req.user.authMode || 'firebase'
      },
      quantity: 1,
      durationMs,
      responseBytes
    }).catch(error => logger.error('API usage counter failed.', {
      wineryId: req.user.wineryId,
      code: error.code || null,
      error: error.message
    }));
  });
  next();
}

module.exports = {
  routeGroupFor,
  usageRequestMeter
};
