// tests/unit/triageService.test.js
// See TEST_PLAN.md section 2.1 for expected cases.

const { triageMessage } = require('../../src/services/triageService');

describe('triageService.triageMessage', () => {
  it('should classify clear address change messages as ADDRESS_CHANGE', async () => {
    const result = await triageMessage({
      body: "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152.",
      member: null,
      winery: null
    });

    expect(result.type).toBe('ADDRESS_CHANGE');
  });
});
