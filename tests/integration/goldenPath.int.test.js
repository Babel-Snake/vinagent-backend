// tests/integration/goldenPath.int.test.js
// Full end-to-end flow as per GOLDEN_PATH.md.

const request = require('supertest');
const app = require('../../src/app');

describe('Golden Path: SMS address change → secure link → confirm', () => {
  it('should eventually update the member address (placeholder test)', async () => {
    // TODO:
    // - Seed DB
    // - POST /api/webhooks/sms
    // - GET /api/tasks
    // - PATCH /api/tasks/:id to APPROVED
    // - GET /api/address-update/validate?token=...
    // - POST /api/address-update/confirm
    // - Assert member updated

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
