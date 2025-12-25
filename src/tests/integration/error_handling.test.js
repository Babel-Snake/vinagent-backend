const request = require('supertest');
const app = require('../../app');
const AppError = require('../../utils/AppError');

describe('Error Handling & Correlation', () => {

    // Helper route to trigger errors
    app.get('/test-error/400', (req, res, next) => {
        next(new AppError('Bad Request Test', 400, 'TEST_BAD_REQUEST'));
    });

    app.get('/test-error/500', (req, res, next) => {
        next(new Error('Unexpected system crash'));
    });

    it('should return standardized 400 error', async () => {
        const res = await request(app)
            .get('/test-error/400')
            .expect(400);

        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('TEST_BAD_REQUEST');
        expect(res.body.error.message).toBe('Bad Request Test');
        expect(res.body.error.requestId).toBeDefined(); // Correlation ID
    });

    it('should return standardized 500 error without leaking details in production', async () => {
        // Mock production env behavior (middleware checks process.env.NODE_ENV)
        // Since we can't easily change process.env dynamically for just the middleware logic without reload,
        // we mainly check the STRUCTURE here.

        const res = await request(app)
            .get('/test-error/500')
            .expect(500);

        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('INTERNAL_ERROR');
        expect(res.body.error.message).toBe('An unexpected error occurred');
        expect(res.body.error.requestId).toBeDefined();
    });

    it('should include x-request-id in headers', async () => {
        const res = await request(app)
            .get('/health')
            .expect(200);

        expect(res.headers['x-request-id']).toBeDefined();
    });
});
