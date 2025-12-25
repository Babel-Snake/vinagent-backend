const request = require('supertest');
const app = require('../../app');
const { sequelize, Task, Winery, User, TaskAction } = require('../../models');

describe('Task Execution Integration', () => {
    let wineryId, userId, token;

    beforeAll(async () => {
        process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
        // Setup Winery and User (Manager)
        // Note: Assuming DB is UP. If down, this fails.
        // We'll proceed assuming standard test env.
        await sequelize.sync({ force: true });

        const winery = await Winery.create({
            name: 'Exec Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'exec@test.com'
        });
        wineryId = winery.id;

        const user = await User.create({
            email: 'manager@test.com',
            role: 'manager',
            wineryId,
            firebaseUid: 'test-exec-uid'
        });
        userId = user.id;

        // Mock Auth Token? 
        // We can use a stub token if we mock the auth middleware, or generate one if strictly checking.
        // For integration test on routes, we usually set 'Authorization'.
        // BUT, here we might test the SERVICE directly to avoid routing complexity and 401s?
        // "Add tests for execution triggers... run full suite" suggests API or Service level.
        // User asked to "Build the post-approval task execution layer".
        // Service test is better for "Execution layer".
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should trigger execution when task is APPROVED via Service', async () => {
        const taskService = require('../../services/taskService');

        // 1. Create Task (ORDER type)
        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING_REVIEW',
            payload: { orderId: '123' },
            createdBy: userId
        });

        // 2. Approve Task via Service
        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'APPROVED' }
        });

        // 3. Check Task Status - Should be EXECUTED (via stub)
        const updatedTask = await Task.findByPk(task.id);
        expect(updatedTask.status).toBe('EXECUTED');

        // 4. Check Audit Log (TaskAction)
        const actions = await TaskAction.findAll({ where: { taskId: task.id } });
        // Should have: MANUAL_UPDATE (Approved) + EXECUTED (Stub)
        const approvedAction = actions.find(a => a.actionType === 'APPROVED');
        const executedAction = actions.find(a => a.actionType === 'EXECUTED');

        expect(approvedAction).toBeDefined();
        expect(approvedAction.userId).toBe(userId);

        expect(executedAction).toBeDefined();
        expect(executedAction.details.action).toBe('ORDER_UPDATE_STUB');
    });

    it('should NOT execute if validation fails (ADDRESS_CHANGE without payload)', async () => {
        const taskService = require('../../services/taskService');

        // 1. Create Task (Address Change) - Missing Payload
        const task = await Task.create({
            wineryId,
            type: 'ADDRESS_CHANGE',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            status: 'PENDING_REVIEW',
            payload: {}, // Invalid
            memberId: 1 // Dummy
        });

        // 2. Try Approve - Should Fail Validation inside updateTask
        await expect(taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'APPROVED' }
        })).rejects.toThrow('Cannot approve');
    });
});
