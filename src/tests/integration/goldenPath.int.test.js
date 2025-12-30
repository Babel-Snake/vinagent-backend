// src/tests/integration/goldenPath.int.test.js
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');

// Mock Triage to ensure deterministic classification
jest.mock('../../services/triage.service', () => ({
    triageMessage: jest.fn().mockResolvedValue({
        type: 'ACCOUNT_ADDRESS_CHANGE',
        category: 'ACCOUNT',
        subType: 'ACCOUNT_ADDRESS_CHANGE',
        status: 'PENDING_REVIEW',
        priority: 'normal',
        sentiment: 'NEUTRAL',
        payload: {
            originalText: "Hi, I've moved.",
            newAddress: {
                addressLine1: "12 Oak Street",
                suburb: "Stirling",
                postcode: "5152"
            }
        },
        requiresApproval: true,
        suggestedChannel: 'sms',
        suggestedTitle: 'Address Change Request',
        customerType: 'MEMBER'
    }),
    classifyStaffNote: jest.fn()
}));

// Mock SMS Service to avoid external calls
jest.mock('../../services/smsService', () => ({
    sendSms: jest.fn().mockResolvedValue({ sid: 'SM_MOCK_SENT' })
}));

let app;
let sequelize, Winery, Member, User, Task, MemberActionToken, WinerySettings;

describe('Golden Path E2E: Address Change Flow', () => {
    let winery, member, manager;

    beforeAll(async () => {
        // Reset modules to ensure mocks apply and fresh DB connection
        jest.resetModules();

        const models = require('../../models');
        sequelize = models.sequelize;
        Winery = models.Winery;
        Member = models.Member;
        User = models.User;
        Task = models.Task;
        MemberActionToken = models.MemberActionToken;
        WinerySettings = models.WinerySettings;

        app = require('../../app');

        // Sync the instance we just loaded
        await sequelize.sync({ force: true });

        // Setup Data
        winery = await Winery.create({
            id: 1,
            name: 'Sunrise Ridge Winery',
            timeZone: 'Australia/Adelaide',
            contactPhone: '+61123456789',
            contactEmail: 'hello@sunrise.com'
        });

        await WinerySettings.create({
            wineryId: 1,
            enableSecureLinks: true,
            enableWineClubModule: true
        });

        member = await Member.create({
            id: 42,
            wineryId: 1,
            firstName: 'Emma',
            lastName: 'Clarke',
            phone: '+61412345678',
            email: 'emma.clarke@example.com',
            addressLine1: '5 River Road',
            suburb: 'Crafers',
            state: 'SA',
            postcode: '5152',
            country: 'Australia'
        });

        manager = await User.create({
            id: 7,
            email: 'stub@example.com',
            wineryId: 1,
            role: 'manager',
            firebaseUid: 'stub-uid'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('completes the full address change flow', async () => {
        // 1. Inbound SMS
        console.log('Step 1: Sending Inbound SMS');
        const smsRes = await request(app)
            .post('/api/webhooks/sms')
            .send({
                From: '+61412345678',
                To: '+61123456789',
                Body: "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152.",
                MessageSid: 'SM_GOLDEN_PATH_001'
            });

        expect(smsRes.status).toBe(200);
        const taskId = smsRes.body.taskId;
        expect(taskId).toBeDefined();

        // 2. Verify Task Created & Pending
        console.log('Step 2: verifying Task Creation');
        const taskRes = await request(app)
            .get(`/api/tasks/${taskId}`)
            .set('Authorization', 'Bearer mock-token'); // Bypass enabled

        expect(taskRes.status).toBe(200);
        expect(taskRes.body.task.status).toBe('PENDING_REVIEW');
        expect(taskRes.body.task.subType).toBe('ACCOUNT_ADDRESS_CHANGE');

        // 3. Approve Task
        console.log('Step 3: Approving Task');
        const approveRes = await request(app)
            .patch(`/api/tasks/${taskId}`)
            .set('Authorization', 'Bearer mock-token')
            .send({
                status: 'APPROVED',
                // Simulate Manager confirming the payload
                payload: {
                    newAddress: {
                        addressLine1: "12 Oak Street",
                        suburb: "Stirling",
                        state: "SA",
                        postcode: "5152",
                        country: "Australia"
                    }
                }
            });

        expect(approveRes.status).toBe(200);
        expect(approveRes.body.task.status).toBe('AWAITING_MEMBER_ACTION');

        // 4. Retrieve Generated Token
        console.log('Step 4: Retrieving Token');
        const tokenRecord = await MemberActionToken.findOne({
            where: { taskId },
            order: [['createdAt', 'DESC']]
        });
        expect(tokenRecord).not.toBeNull();
        const tokenString = tokenRecord.token;

        // 5. Member Validates Token (User clicks link)
        console.log('Step 5: Validating Token via Public API');
        const validateRes = await request(app)
            .get(`/api/public/address-update/validate?token=${tokenString}`);

        expect(validateRes.status).toBe(200);
        expect(validateRes.body.member.firstName).toBe('Emma');
        expect(validateRes.body.proposedAddress.addressLine1).toBe('12 Oak Street');

        // 6. Member Confirms Address
        console.log('Step 6: Member Confirms Address');
        const confirmRes = await request(app)
            .post('/api/public/address-update/confirm')
            .send({
                token: tokenString,
                newAddress: {
                    addressLine1: "12 Oak Street",
                    suburb: "Stirling",
                    state: "SA",
                    postcode: "5152",
                    country: "Australia"
                }
            });

        expect(confirmRes.status).toBe(200);
        expect(confirmRes.body.status).toBe('ok');
        expect(confirmRes.body.member.id).toBe(42);

        // 7. Verify Final State (Member Address Updated)
        console.log('Step 7: Verify DB State');
        const updatedMember = await Member.findByPk(42);
        expect(updatedMember.addressLine1).toBe('12 Oak Street');
        expect(updatedMember.suburb).toBe('Stirling');

        // 8. Verify Task Executed
        const finalTask = await Task.findByPk(taskId);
        expect(finalTask.status).toBe('EXECUTED');

        // 9. Verify Token marked used
        const usedToken = await MemberActionToken.findByPk(tokenRecord.id);
        expect(usedToken.usedAt).not.toBeNull();
    });
});
