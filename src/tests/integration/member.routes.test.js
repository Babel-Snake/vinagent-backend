process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
    sequelize,
    Winery,
    User,
    Member,
    CustomerMergeRedirect,
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

        await Winery.create({
            id: 2,
            name: 'Other Member Route Test',
            timeZone: 'Australia/Adelaide'
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

    it('always assigns new customers to the authenticated winery and rejects reassignment', async () => {
        const rejectedCreate = await request(app)
            .post('/api/members')
            .set('Authorization', authToken)
            .send({
                firstName: 'Wrong',
                lastName: 'Winery',
                wineryId: 2
            })
            .expect(400);

        expect(rejectedCreate.body.error.code).toBe('IMMUTABLE_WINERY');
        expect(await Member.count({ where: { firstName: 'Wrong' } })).toBe(0);

        const created = await request(app)
            .post('/api/members')
            .set('Authorization', authToken)
            .send({ firstName: 'Locked', lastName: 'Customer' })
            .expect(201);

        expect(created.body.member.wineryId).toBe(1);

        const rejectedUpdate = await request(app)
            .put(`/api/members/${created.body.member.id}`)
            .set('Authorization', authToken)
            .send({ wineryId: 2 })
            .expect(400);

        expect(rejectedUpdate.body.error.code).toBe('IMMUTABLE_WINERY');
        expect((await Member.findByPk(created.body.member.id)).wineryId).toBe(1);
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
            tokenHash: 'a'.repeat(64),
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
        const redirect = await CustomerMergeRedirect.findOne({
            where: { wineryId: 1, sourceMemberId: source.id }
        });

        expect(task).toBeTruthy();
        expect(message).toBeTruthy();
        expect(token).toBeTruthy();
        expect(deletedSource).toBeNull();
        expect(redirect.targetMemberId).toBe(target.id);
        expect(updatedTarget.tags).toEqual(expect.arrayContaining(['vip', 'order_customer']));
        expect(updatedTarget.notes).toMatch(/Merged customer Jane Smith/);
    });

    it('does not count or return tasks from another winery through a legacy member link', async () => {
        const member = await Member.create({
            firstName: 'Tenant',
            lastName: 'Boundary',
            email: 'tenant.boundary@example.com',
            wineryId: 1
        });
        const localTask = await Task.create({
            wineryId: 1,
            category: 'GENERAL',
            subType: 'LOCAL_TASK',
            status: 'PENDING',
            memberId: member.id
        });
        const foreignTask = await Task.create({
            wineryId: 2,
            category: 'GENERAL',
            subType: 'FOREIGN_TASK',
            status: 'PENDING',
            memberId: member.id
        });

        const list = await request(app)
            .get('/api/members')
            .query({ q: 'Tenant' })
            .set('Authorization', authToken)
            .expect(200);
        const listedMember = list.body.members.find(item => item.id === member.id);
        expect(Number(listedMember.taskCount)).toBe(1);

        const detail = await request(app)
            .get(`/api/members/${member.id}`)
            .set('Authorization', authToken)
            .expect(200);
        expect(detail.body.member.Tasks.map(task => task.id)).toEqual([localTask.id]);
        expect(detail.body.member.Tasks.map(task => task.id)).not.toContain(foreignTask.id);
    });
});
