const {
  DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS,
  getAxiosOutboundPolicy,
  getOutboundHttpTimeoutMs
} = require('../../utils/outboundHttpPolicy');

describe('outbound HTTP policy', () => {
  const originalTimeout = process.env.OUTBOUND_HTTP_TIMEOUT_MS;

  afterEach(() => {
    if (originalTimeout === undefined) delete process.env.OUTBOUND_HTTP_TIMEOUT_MS;
    else process.env.OUTBOUND_HTTP_TIMEOUT_MS = originalTimeout;
  });

  it('uses a bounded default timeout and refuses redirects', () => {
    delete process.env.OUTBOUND_HTTP_TIMEOUT_MS;
    expect(getAxiosOutboundPolicy()).toEqual({
      timeout: DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS,
      maxRedirects: 0
    });
  });

  it('clamps operator-supplied timeout values to safe bounds', () => {
    expect(getOutboundHttpTimeoutMs('1')).toBe(1000);
    expect(getOutboundHttpTimeoutMs('120000')).toBe(60000);
    expect(getOutboundHttpTimeoutMs('not-a-number')).toBe(DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS);
  });
});
