const express = require('express');
const { checkOperationalReadiness } = require('../services/operationalReadiness.service');
const runtimeState = require('../services/runtimeState.service');

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sanitizeChecks(checks = {}) {
  return Object.fromEntries(Object.entries(checks).map(([name, check]) => [name, {
    status: check.status,
    ...(check.code ? { code: check.code } : {})
  }]));
}

function createHealthRouter({
  readinessCheck = checkOperationalReadiness,
  readinessTimeoutMs = positiveNumber(process.env.HEALTH_READINESS_TIMEOUT_MS, 5000),
  readinessCacheMs = positiveNumber(process.env.HEALTH_READINESS_CACHE_MS, 2000),
  isDraining = runtimeState.isDraining
} = {}) {
  const router = express.Router();
  let cachedResult = null;
  let cachedAt = 0;
  let inFlight = null;

  const getReadiness = () => {
    // A cached success must never outlive the start of graceful shutdown.
    // The default readiness service returns SERVER_DRAINING without touching
    // dependencies, so bypass both the cache and an older in-flight probe.
    if (isDraining()) return Promise.resolve().then(() => readinessCheck());

    const now = Date.now();
    if (cachedResult && readinessCacheMs > 0 && now - cachedAt < readinessCacheMs) {
      return Promise.resolve(cachedResult);
    }
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(() => readinessCheck())
      .then(result => {
        cachedResult = result;
        cachedAt = Date.now();
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const withTimeout = promise => {
    if (readinessTimeoutMs === 0) return promise;
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error('Readiness check timed out.');
        error.code = 'READINESS_TIMEOUT';
        reject(error);
      }, readinessTimeoutMs);
      if (typeof timeout.unref === 'function') timeout.unref();
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
  };

  const live = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ status: 'ok' });
  };

  router.get('/', live);
  router.get('/live', live);
  router.get('/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const result = await withTimeout(getReadiness());
      return res.status(result.ready ? 200 : 503).json({
        status: result.ready ? 'ready' : 'not_ready',
        checks: sanitizeChecks(result.checks)
      });
    } catch (error) {
      return res.status(503).json({
        status: 'not_ready',
        checks: {
          readiness: {
            status: 'fail',
            code: error.code === 'READINESS_TIMEOUT' ? 'READINESS_TIMEOUT' : 'READINESS_CHECK_FAILED'
          }
        }
      });
    }
  });

  return router;
}

module.exports = createHealthRouter();
module.exports.createHealthRouter = createHealthRouter;
