const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, Task, User } = require('../../models');

describe('Task Routes', () => {
    let winery;
    let authToken = 'Bearer mock-token';

    beforeAll(async () => {
        // Create Winery
        try {
            // Try to find or create ID 1 to match the stub auth middleware
            const [w, created] = await Winery.findOrCreate({
                where: { id: 1 },
                defaults: {
                    name: 'Task Test Winery',
                    timeZone: 'Australia/Adelaide',
                    contactEmail: 'tasks@example.com'
                }
            });
            winery = w;

            // Also create User and Default Settings
            await User.findOrCreate({
                where: { id: 7 },
                defaults: {
                    firebaseUid: 'stub-uid-7',
                    email: 'stub@example.com',
                    displayName: 'Stub User',
                    role: 'manager',
                    wineryId: w.id
                }
            });

            // Ensure settings exist for feature flags
            const { WinerySettings } = require('../../models');
            await WinerySettings.findOrCreate({
                where: { wineryId: w.id },
                defaults: {
                    tier: 'ADVANCED',
                    enableWineClubModule: true,
                    enableSecureLinks: true
                }
            });

        } catch (e) {
            console.log('Error setting up winery:', e);
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('GET /api/tasks', () => {
        it('should list tasks for the authenticated winery', async () => {
            // Seed a task for Winery 1
            await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING_REVIEW',
                wineryId: 1,
                priority: 'normal'
            });

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', authToken)
                .expect(200);

            expect(Array.isArray(res.body.tasks)).toBe(true);
            expect(res.body.tasks.length).toBeGreaterThan(0);
            expect(res.body.tasks[0].wineryId).toBe(1);
        });

        it('should 401 without token', async () => {
            await request(app)
                .get('/api/tasks')
                .expect(401);
        });
    });

    describe('POST /api/tasks/autoclassify', () => {
        it('should autoclassify a staff note', async () => {
            const res = await request(app)
                .post('/api/tasks/autoclassify')
                .send({ text: 'The printer is out of ink' })
                .set('Authorization', authToken) // Stub auth
                .expect(200);

            expect(res.body.category).toBe('OPERATIONS');
            expect(res.body.subType).toBe('OPERATIONS_SUPPLY_REQUEST');
            expect(res.body.suggestedTitle).toBeDefined();
        });
    });

    describe('POST /api/tasks (Manual Creation)', () => {
        it('should create a task with new fields (sentiment, attribution)', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    category: 'OPERATIONS',
                    subType: 'OPERATIONS_ESCALATION',
                    sentiment: 'NEGATIVE',
                    notes: 'Customer is very upset',
                    priority: 'high'
                })
                .set('Authorization', authToken)
                .expect(201);

            const task = res.body.task;
            expect(task.category).toBe('OPERATIONS');
            expect(task.subType).toBe('OPERATIONS_ESCALATION');
            expect(task.sentiment).toBe('NEGATIVE');
            expect(task.createdBy).toBe(7); // Stub user ID
        });
    });

    describe('PATCH /api/tasks/:id', () => {
        let task;
        beforeEach(async () => {
            task = await Task.create({
                wineryId: winery.id,
                status: 'PENDING_REVIEW',
                category: 'GENERAL'
            });
        });

        it('should update task assignment and log action', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({ assigneeId: 7 }) // Assign to self
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.assigneeId).toBe(7);

            // Verify Logic: Action Log
            const { TaskAction } = require('../../models');
            const action = await TaskAction.findOne({
                where: { taskId: task.id, actionType: 'ASSIGNED' }
            });
            expect(action).toBeDefined();
            expect(action.userId).toBe(7);
        });

        it('should approve task and trigger execution', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${task.id}`) // Use ID
                .send({
                    status: 'APPROVED',
                    payload: { someData: 123 }
                })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.status).toBe('APPROVED');
        });

        it('should approve a task and record who did it', async () => {
            const taskToApprove = await Task.create({
                type: 'ADDRESS_CHANGE',
                status: 'PENDING_REVIEW',
                wineryId: 1
            });

            const res = await request(app)
                .patch(`/api/tasks/${taskToApprove.id}`)
                .set('Authorization', authToken)
                .send({ status: 'APPROVED' })
                .expect(200);

            expect(res.body.task.status).toBe('APPROVED');
            expect(res.body.task.updatedBy).toBe(7); // Stub user ID

            // Verify DB
            const updated = await Task.findByPk(taskToApprove.id);
            expect(updated.status).toBe('APPROVED');
        });

        it('should execute ADDRESS_CHANGE by updating member details', async () => {
            // Create Member
            const member = await require('../../models').Member.create({
                firstName: 'John',
                lastName: 'Doe',
                wineryId: winery.id,
                addressLine1: '1 Old St',
                suburb: 'Old Town',
                state: 'SA',
                postcode: '5000'
            });

            const task = await Task.create({
                type: 'ADDRESS_CHANGE',
                status: 'PENDING_REVIEW',
                wineryId: winery.id,
                memberId: member.id,
                payload: {
                    addressLine1: '2 New St',
                    suburb: 'New Town',
                    state: 'VIC',
                    postcode: '3000'
                }
            });

            await request(app)
                .patch(`/api/tasks/${task.id}`)
                .set('Authorization', authToken)
                .send({ status: 'APPROVED' })
                .expect(200);

            // Verify Member Updated
            const updatedMember = await require('../../models').Member.findByPk(member.id);
            expect(updatedMember.addressLine1).toBe('2 New St');
            expect(updatedMember.suburb).toBe('New Town');
            expect(updatedMember.state).toBe('VIC');
        });
    });
});
