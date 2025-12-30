// src/tests/integration/boot.test.js
// Tests for application bootstrap and model initialization

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const db = require('../../models');

describe('Boot Sequence Integration', () => {

    beforeAll(async () => {
        // Sync the test database
        await db.sequelize.sync({ force: true });
    });

    afterAll(async () => {
        await db.sequelize.close();
    });

    // We want to verify that models are loaded and available
    it('should have initialized Sequelize models', async () => {
        // Since this test environment loads models via ../models/index.js (implicitly via db require)
        // We just check if they are present on the db object.
        expect(db.sequelize).toBeDefined();

        // Check for core models
        expect(db.Winery).toBeDefined();
        expect(db.Task).toBeDefined();
        expect(db.Member).toBeDefined();

        // Check association (e.g. Task has belongTo Winery)
        // Accessing raw attributes or associations
        expect(db.Task.associations.Winery).toBeDefined();
    });

    it('should respond to health check', async () => {
        const res = await request(app)
            .get('/health')
            .expect(200);

        expect(res.body.status).toBe('ok');
    });

    it('should be able to connect to database', async () => {
        // The sync in beforeAll already verifies connection
        // Just verify we can still query
        const result = await db.sequelize.query('SELECT 1+1 as result');
        expect(result).toBeDefined();
    });
});
