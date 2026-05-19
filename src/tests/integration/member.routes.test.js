process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const request = require('supertest');
const app = require('../../app');
const {
    sequelize,
    Winery,
    User,
    Member,
    Task,
    Message,
    MemberActionToken
} = require('../../models');

describe('Member Routes', () => {
    const authToken = 'Bearer mock-token';

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        await Winery.create({
            id: 1,
            name: 'Member Route Test',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'members@example.com'
        });

        await User.create({
            id: 7,
            firebaseUid: 'stub-uid',
            email: 'stub@example.com',
            displayName: 'Stub Manager',
            role: 'manager',
            wineryId: 1
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should merge a source customer into the target and reassign linked records', async () => {
        const target = await Member.create({
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.target@example.com',
            phone: '+61400111222',
            tags: ['vip'],
            lifetimeSpend: 100,
            wineryId: 1
        });

        const source = await Member.create({
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.source@example.com',
            phone: '+61400999888',
            tags: ['order_customer'],
            lifetimeSpend: 55,
            totalOrders: 2,
            wineryId: 1
        });

        await Task.create({
            wineryId: 1,
            category: 'ORDER',
            subType: 'ORDER_STATUS',
            status: 'PENDING',
            memberId: source.id
        });

        await Message.create({
            wineryId: 1,
            source: 'email',
            direction: 'inbound',
            body: 'Need help',
            memberId: source.id
        });

        await MemberActionToken.create({
            memberId: source.id,
            wineryId: 1,
            taskId: null,
            type: 'ADDRESS_CHANGE',
            channel: 'sms',
            token: 'merge-test-token',
            expiresAt: new Date(Date.now() + 3600_000)
        });

        const res = await request(app)
            .post(`/api/members/${target.id}/merge`)
            .set('Authorization', authToken)
            .send({
                sourceMemberId: source.id,
                fieldOverrides: {
                    email: 'source',
                    phone: 'target',
                    notes: 'combine'
                }
            })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.member.email).toBe('jane.source@example.com');
        expect(res.body.member.phone).toBe('+61400111222');
        expect(Number(res.body.member.lifetimeSpend)).toBe(155);

        const task = await Task.findOne({ where: { memberId: target.id } });
        const message = await Message.findOne({ where: { memberId: target.id } });
        const token = await MemberActionToken.findOne({ where: { memberId: target.id } });
        const deletedSource = await Member.findByPk(source.id);
        const updatedTarget = await Member.findByPk(target.id);

        expect(task).toBeTruthy();
        expect(message).toBeTruthy();
        expect(token).toBeTruthy();
        expect(deletedSource).toBeNull();
        expect(updatedTarget.tags).toEqual(expect.arrayContaining(['vip', 'order_customer']));
        expect(updatedTarget.notes).toMatch(/Merged customer Jane Smith/);
    });
});
