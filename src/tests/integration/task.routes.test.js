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

            // Also create the stub User (ID 7) to satisfy foreign key 'updatedBy'
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

    describe('PATCH /api/tasks/:id/status', () => {
        it('should approve a task and record who did it', async () => {
            const task = await Task.create({
                type: 'ADDRESS_CHANGE',
                status: 'PENDING_REVIEW',
                wineryId: 1
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/status`)
                .set('Authorization', authToken)
                .send({ status: 'APPROVED' })
                .expect(200);

            expect(res.body.task.status).toBe('APPROVED');
            expect(res.body.task.updatedBy).toBe(7); // Stub user ID

            // Verify DB
            const updated = await Task.findByPk(task.id);
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
                .patch(`/api/tasks/${task.id}/status`)
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
