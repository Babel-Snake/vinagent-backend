const usageTracking = require('../services/usageTracking.service');

async function recordActivity(req, res, next) {
  try {
    const result = await usageTracking.recordActivityHeartbeat({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      authMode: req.user.authMode || 'firebase',
      sessionId: req.body.sessionId,
      sequence: req.body.sequence,
      engagedSeconds: req.body.engagedSeconds,
      routeGroup: req.body.routeGroup,
      occurredAt: new Date()
    });
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
}

async function getSummary(req, res, next) {
  try {
    const summary = await usageTracking.getUsageSummary({
      wineryId: req.user.wineryId,
      start: req.query.start,
      end: req.query.end
    });
    res.set('Cache-Control', 'no-store');
    res.json({ usage: summary });
  } catch (error) {
    next(error);
  }
}

async function captureSnapshot(req, res, next) {
  try {
    const snapshot = await usageTracking.captureGaugeSnapshots({ wineryId: req.user.wineryId });
    res.status(201).json({ snapshot });
  } catch (error) {
    next(error);
  }
}

async function reconcile(req, res, next) {
  try {
    const result = await usageTracking.runUsageReconciliation({
      wineryId: req.user.wineryId,
      start: req.body.start,
      end: req.body.end
    });
    res.status(result.status === 'ok' ? 200 : 409).json({ reconciliation: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  captureSnapshot,
  getSummary,
  reconcile,
  recordActivity
};
