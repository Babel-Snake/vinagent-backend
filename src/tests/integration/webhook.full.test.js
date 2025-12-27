const request = require('supertest');
const { sequelize, Winery, Member, Message, Task, WinerySettings } = require('../../models');

// Use NODE_ENV=test so app and db use sqlite
process.env.NODE_ENV = 'test';
process.env.TWILIO_AUTH_TOKEN = 'mock-auth-token';

// Mock Twilio client BEFORE requiring app/middleware
jest.mock('twilio', () => {
    return {
        validateRequest: jest.fn().mockReturnValue(true) // Always pass signature check
    };
});

const app = require('../../app');

describe('Webhook Full Integration (with SQLite)', () => {

    beforeAll(async () => {
        // Force sync with SQLite (creates in-memory tables)
        await sequelize.sync({ force: true });

        // Seed data
        await Winery.create({
            id: 1,
            name: 'Test Winery',
            contactPhone: '+15557654321', // Corresponds to 'To'
            contactEmail: 'winery@test.com'
        });

        await Member.create({
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            phone: '+15551234567', // Corresponds to 'From'
            email: 'john@test.com',
            wineryId: 1
        });

        await WinerySettings.create({
            wineryId: 1,
            enableWineClubModule: true,
            enableOrdersModule: true
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should ingest SMS, persist Message/Task, and verify DB state', async () => {
        const payload = {
            From: '+15551234567',
            To: '+15557654321', // Matches Test Winery
            Body: 'I want to order wine',
            MessageSid: 'SM_TEST_FULL_001'
        };

        const res = await request(app)
            .post('/api/webhooks/sms')
            .set('x-twilio-signature', 'mock-signature')
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.taskId).toBeDefined();

        // Verify DB Persistence
        const message = await Message.findOne({ where: { externalId: 'SM_TEST_FULL_001' } });
        expect(message).not.toBeNull();
        expect(message.body).toBe('I want to order wine');
        expect(message.source).toBe('sms');
        expect(message.wineryId).toBe(1);
        expect(message.memberId).toBe(1);

        // Verify Task
        const task = await Task.findByPk(res.body.taskId);
        expect(task).not.toBeNull();
        expect(task.messageId).toBe(message.id);
        expect(task.category).toBe('ORDER'); // Heuristic should catch "order"
    });

    it('should handle duplicate SMS idempotently', async () => {
        // Send same message again
        const payload = {
            From: '+15551234567',
            To: '+15557654321',
            Body: 'I want to order wine',
            MessageSid: 'SM_TEST_FULL_001' // Same ID
        };

        const res = await request(app)
            .post('/api/webhooks/sms')
            .set('x-twilio-signature', 'mock-signature')
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.duplicate).toBe(true);
        expect(res.body.taskId).toBeNull();
    });

    it('should drop message for unknown winery', async () => {
        const payload = {
            From: '+15551234567',
            To: '+19999999999', // Unknown
            Body: 'Hello',
            MessageSid: 'SM_UNKNOWN_001'
        };

        const res = await request(app)
            .post('/api/webhooks/sms')
            .set('x-twilio-signature', 'mock-signature')
            .send(payload);

        // Controller throws AppError(400)
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('UNKNOWN_DESTINATION');

        // Verify NOT persisted
        const message = await Message.findOne({ where: { externalId: 'SM_UNKNOWN_001' } });
        expect(message).toBeNull();
    });
});
