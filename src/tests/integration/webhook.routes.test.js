process.env.AI_SKIP = 'true';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, Message, Task } = require('../../models');

describe('Webhook Routes', () => {
    let wineryId;

    // Setup: Create a dummy winery
    beforeAll(async () => {
        process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
        await sequelize.sync({ force: true });
        const winery = await Winery.create({
            name: 'Test Winery Webhook',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'test@example.com'
        });
        wineryId = winery.id;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('POST /api/webhooks/sms', () => {
        it('should receive Twilio payload, create message and task', async () => {
            // Use a unique phone number to avoid colliding with previous test runs in non-cleared DB
            const uniquePhone = '+614' + Math.floor(Math.random() * 100000000).toString();

            const payload = {
                From: '+61400000000',
                To: uniquePhone,
                Body: 'I need to check my delivery status',
                MessageSid: 'SM123456789'
            };

            // Update our winery to have this unique phone number
            await Winery.update({ contactPhone: uniquePhone }, { where: { id: wineryId } });

            const res = await request(app)
                .post('/api/webhooks/sms')
                .send(payload)
                .expect(200);

            // Check response
            expect(res.body.success).toBe(true);
            expect(res.body.taskId).toBeDefined();

            // Check DB - Message
            // We search by External ID. Note: if we run multiple times with same MessageSid, we might find old one?
            // But MessageSid should probably be unique contextually. 
            // Ideally we find the ONE we just created.
            // Since we check the body, and body is constant...
            // Let's rely on the fact that we find *A* message.
            // Or better, let's make MessageSid unique too.
            // But the controller splits by logic.

            const message = await Message.findOne({ where: { body: 'I need to check my delivery status', wineryId } });
            expect(message).toBeDefined();
            expect(message.source).toBe('sms');

            // Check DB - Task
            const task = await Task.findOne({ where: { messageId: message.id } });
            expect(task).toBeDefined();
            expect(task.type).toBe('ORDER_SHIPPING_DELAY');
            expect(task.wineryId).toBe(wineryId);
        });

        it('should return 400 if winery not found', async () => {
            const payload = {
                From: '+61400000000',
                To: '+61999999999', // Unknown
                Body: 'Hello'
            };

            await request(app)
                .post('/api/webhooks/sms')
                .send(payload)
                .expect(400);
        });
    });

    describe('POST /api/webhooks/email', () => {
        beforeAll(() => {
            process.env.EMAIL_WEBHOOK_SECRET = 'test-secret';
        });

        it('should receive Email payload and create task', async () => {
            const payload = {
                from: 'member@example.com',
                to: 'test@example.com', // Matches winery contactEmail created in beforeAll
                subject: 'Booking Enquiry',
                text: 'I want to book a table for 2',
                messageId: 'email-123-' + Date.now()
            };

            const res = await request(app)
                .post('/api/webhooks/email')
                .set('x-email-webhook-signature', 'test-secret')
                .send(payload)
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.taskId).toBeDefined();

            const message = await Message.findOne({ where: { externalId: payload.messageId } });
            expect(message).toBeDefined();
            expect(message.source).toBe('email');
        });

        it('should reject invalid signature', async () => {
            await request(app)
                .post('/api/webhooks/email')
                .set('x-email-webhook-signature', 'wrong-secret')
                .send({ from: 'a@b.com', to: 'b@c.com', messageId: '1' })
                .expect(403);
        });
    });

    describe('POST /api/webhooks/voice', () => {
        it('should receive Voice payload and create task', async () => {
            // Assuming Twilio signature validation skipped in test env (no Auth Token)
            // We need a unique call Sid
            const callSid = 'CA' + Math.floor(Math.random() * 100000000).toString();
            const payload = {
                From: '+61400000000',
                To: '+61499999999', // We need to match winery phone
                CallSid: callSid,
                TranscriptionText: 'Hello verify this call',
                RecordingUrl: 'http://example.com/rec.mp3'
            };

            // Update winery phone to match To
            await Winery.update({ contactPhone: payload.To }, { where: { id: wineryId } });

            const res = await request(app)
                .post('/api/webhooks/voice')
                .send(payload)
                .expect(200);

            expect(res.body.success).toBe(true);

            const message = await Message.findOne({ where: { externalId: callSid } });
            expect(message).toBeDefined();
            expect(message.source).toBe('voice');
        });
    });
});
