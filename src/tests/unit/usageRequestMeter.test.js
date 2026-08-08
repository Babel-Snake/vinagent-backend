const { EventEmitter } = require('events');

jest.mock('../../services/usageTracking.service', () => ({
  incrementUsageCounter: jest.fn().mockResolvedValue({})
}));
jest.mock('../../config/logger', () => ({ error: jest.fn() }));

const { incrementUsageCounter } = require('../../services/usageTracking.service');
const { routeGroupFor, usageRequestMeter } = require('../../middleware/usageRequestMeter');
const { METRICS } = require('../../services/usageMetricCatalog');

class ResponseStub extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
  }

  getHeader(name) {
    return name === 'content-length' ? '256' : undefined;
  }
}

describe('usage request meter', () => {
  const originalTestFlag = process.env.USAGE_REQUEST_METER_IN_TEST;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USAGE_REQUEST_METER_IN_TEST = 'true';
  });

  afterAll(() => {
    if (originalTestFlag === undefined) delete process.env.USAGE_REQUEST_METER_IN_TEST;
    else process.env.USAGE_REQUEST_METER_IN_TEST = originalTestFlag;
  });

  it('uses only an allowlisted route group and records identity after authentication completes', async () => {
    const req = { originalUrl: '/api/tasks/123?memberEmail=secret@example.com', method: 'GET' };
    const res = new ResponseStub();
    const next = jest.fn(() => {
      req.user = { wineryId: 7, role: 'manager', authMode: 'firebase' };
    });

    usageRequestMeter(req, res, next);
    res.emit('finish');
    await new Promise(resolve => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(incrementUsageCounter).toHaveBeenCalledWith(expect.objectContaining({
      wineryId: 7,
      metricKey: METRICS.API_REQUESTS,
      dimensions: {
        routeGroup: 'tasks',
        method: 'GET',
        statusClass: '2xx',
        role: 'manager',
        authMode: 'firebase'
      },
      quantity: 1,
      responseBytes: 256
    }));
    expect(JSON.stringify(incrementUsageCounter.mock.calls)).not.toContain('secret@example.com');
  });

  it('does not record unauthenticated traffic and normalizes unknown paths', async () => {
    expect(routeGroupFor({ originalUrl: '/api/private-customer-slug/abc?token=secret' })).toBe('other');
    const req = { originalUrl: '/api/public/pin-login', method: 'POST' };
    const res = new ResponseStub();
    usageRequestMeter(req, res, jest.fn());
    res.emit('finish');
    await new Promise(resolve => setImmediate(resolve));
    expect(incrementUsageCounter).not.toHaveBeenCalled();
  });
});
