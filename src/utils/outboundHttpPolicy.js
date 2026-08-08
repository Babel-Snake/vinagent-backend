const DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS = 10_000;
const MIN_OUTBOUND_HTTP_TIMEOUT_MS = 1_000;
const MAX_OUTBOUND_HTTP_TIMEOUT_MS = 60_000;

function getOutboundHttpTimeoutMs(value = process.env.OUTBOUND_HTTP_TIMEOUT_MS) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS;
  return Math.min(Math.max(parsed, MIN_OUTBOUND_HTTP_TIMEOUT_MS), MAX_OUTBOUND_HTTP_TIMEOUT_MS);
}

function getAxiosOutboundPolicy() {
  return {
    timeout: getOutboundHttpTimeoutMs(),
    // Provider endpoints are fixed/configured by operators. Following redirects
    // can forward a signed request somewhere that was never configured.
    maxRedirects: 0
  };
}

module.exports = {
  DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS,
  getAxiosOutboundPolicy,
  getOutboundHttpTimeoutMs
};
