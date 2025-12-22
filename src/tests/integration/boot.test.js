const request = require('supertest');
const app = require('../../app');
const db = require('../../models');

describe('Boot Sequence Integration', () => {

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

    it('should be able to connect (authentication check)', async () => {
        try {
            await db.sequelize.authenticate();
        } catch (err) {
            // If DB is down locally, we catch it but fail the test with a clear message
            // or we might skip. But "Integration Check" implies we want to know if it connects.
            // Given previous ECONNREFUSED issues, this might fail.
            // We'll throw to ensure visibility.
            throw new Error(`Database connection failed: ${err.message}`);
        }
    });
});
