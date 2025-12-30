const request = require('supertest');

jest.mock('../../models', () => ({
    Message: { create: jest.fn(), findOne: jest.fn() },
    Winery: { findOne: jest.fn() },
    Task: { create: jest.fn() },
    Member: { findOne: jest.fn() },
    sequelize: {
        transaction: jest.fn(() => ({
            commit: jest.fn(),
            rollback: jest.fn(),
            finished: false
        }))
    }
}));

jest.mock('../../services/triage.service', () => ({
    triageMessage: jest.fn()
}));

jest.mock('twilio', () => ({
    validateRequest: jest.fn(() => true)
}));

process.env.NODE_ENV = 'test';
process.env.EMAIL_WEBHOOK_SECRET = 'secret';
process.env.TWILIO_AUTH_TOKEN = 'token';

const app = require('../../app');
const { Winery, Task, Member, Message } = require('../../models');
const triageService = require('../../services/triage.service');
const twilio = require('twilio');

describe('Webhook routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/webhooks/email', () => {
        it('creates a task from an email webhook', async () => {
            Winery.findOne.mockResolvedValue({ id: 1 });
            Member.findOne.mockResolvedValue({ id: 2 });
            Message.create.mockResolvedValue({ id: 10 });
            Task.create.mockResolvedValue({ id: 20 });
            triageService.triageMessage.mockResolvedValue({
                type: 'GENERAL_QUERY',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                customerType: 'VISITOR',
                sentiment: 'NEUTRAL',
                status: 'PENDING_REVIEW',
                priority: 'normal',
                payload: {},
                requiresApproval: true,
                suggestedChannel: 'email'
            });

            const res = await request(app)
                .post('/api/webhooks/email')
                .set('x-email-webhook-signature', 'secret')
                .send({
                    from: 'guest@example.com',
                    to: 'team@winery.com',
                    subject: 'Tasting booking',
                    text: 'Can I book a tasting for 4?',
                    messageId: 'abc-123'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.taskId).toBe(20);
            // Task.create is now called with (data, { transaction })
            // Check the first argument contains our expected fields
            expect(Task.create.mock.calls[0][0]).toMatchObject({
                suggestedChannel: 'email',
                wineryId: 1,
                memberId: 2,
                messageId: 10
            });
        });

        it('rejects requests missing the email signature', async () => {
            Winery.findOne.mockResolvedValue({ id: 1 });

            const res = await request(app)
                .post('/api/webhooks/email')
                .send({
                    from: 'guest@example.com',
                    to: 'team@winery.com',
                    subject: 'Missing auth',
                    text: 'hello',
                    messageId: 'abc-123'
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toBeDefined();
        });
    });

    describe('POST /api/webhooks/voice', () => {
        it('creates a task from a voice webhook', async () => {
            Winery.findOne.mockResolvedValue({ id: 3 });
            Member.findOne.mockResolvedValue({ id: 4 });
            Message.create.mockResolvedValue({ id: 30 });
            Task.create.mockResolvedValue({ id: 40 });
            triageService.triageMessage.mockResolvedValue({
                type: 'GENERAL_QUERY',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                customerType: 'VISITOR',
                sentiment: 'NEUTRAL',
                status: 'PENDING_REVIEW',
                priority: 'normal',
                payload: {},
                requiresApproval: true,
                suggestedChannel: 'voice'
            });

            const res = await request(app)
                .post('/api/webhooks/voice')
                .set('x-twilio-signature', 'signed')
                .send({
                    From: '+1111',
                    To: '+2222',
                    CallSid: 'call-123',
                    RecordingUrl: 'https://example.com/recording',
                    TranscriptionText: 'I need to change my booking'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            // Check first argument to Task.create contains expected fields
            expect(Task.create.mock.calls[0][0]).toMatchObject({
                suggestedChannel: 'voice',
                wineryId: 3,
                memberId: 4,
                messageId: 30
            });
            expect(twilio.validateRequest).toHaveBeenCalled();
        });

        it('returns validation errors for bad payloads', async () => {
            Winery.findOne.mockResolvedValue({ id: 3 });

            const res = await request(app)
                .post('/api/webhooks/voice')
                .set('x-twilio-signature', 'signed')
                .send({
                    From: '+1111'
                });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });
});