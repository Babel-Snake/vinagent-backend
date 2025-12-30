// src/tests/integration/execution.test.js
// Tests for task execution triggers and automation

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Task, Winery, User, TaskAction, WinerySettings } = require('../../models');

describe('Task Execution Integration', () => {
    let wineryId, userId, token;

    beforeAll(async () => {
        // Setup Winery, User, and Settings
        await sequelize.sync({ force: true });

        const winery = await Winery.create({
            name: 'Exec Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'exec@test.com'
        });
        wineryId = winery.id;

        // Create WinerySettings with secure links enabled
        await WinerySettings.create({
            wineryId,
            tier: 'ADVANCED',
            enableSecureLinks: true,
            enableWineClubModule: true,
            enableOrdersModule: true,
            enableBookingModule: true
        });

        const user = await User.create({
            email: 'manager@test.com',
            role: 'manager',
            wineryId,
            firebaseUid: 'test-exec-uid'
        });
        userId = user.id;

        // Also create stub user for auth bypass
        await User.create({
            email: 'stub@example.com',
            role: 'manager',
            wineryId,
            firebaseUid: 'stub-uid'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should trigger execution when ORDER task is APPROVED via Service', async () => {
        const taskService = require('../../services/taskService');

        // 1. Create Task (ORDER type)
        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
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
        // Should have: APPROVED + EXECUTED
        const approvedAction = actions.find(a => a.actionType === 'APPROVED');
        const executedAction = actions.find(a => a.actionType === 'EXECUTED');

        expect(approvedAction).toBeDefined();
        expect(approvedAction.userId).toBe(userId);

        expect(executedAction).toBeDefined();
        expect(executedAction.details.action).toBe('ORDER_UPDATE_STUB');
    });

    it('should NOT execute if validation fails (ADDRESS_CHANGE without payload)', async () => {
        const taskService = require('../../services/taskService');

        // 1. Create Task (Address Change) - Missing Payload fields
        const task = await Task.create({
            wineryId,
            type: 'ADDRESS_CHANGE',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            status: 'PENDING_REVIEW',
            payload: {}, // Invalid - missing required fields
            memberId: null // Also missing member
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

    it('should skip execution when secure links are disabled', async () => {
        const taskService = require('../../services/taskService');

        // Disable secure links temporarily
        await WinerySettings.update({ enableSecureLinks: false }, { where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING_REVIEW',
            payload: { orderId: '456' },
            createdBy: userId
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'APPROVED' }
        });

        // Task should stay APPROVED (not EXECUTED) since secure links disabled
        const updatedTask = await Task.findByPk(task.id);
        expect(updatedTask.status).toBe('APPROVED');

        // Re-enable for other tests
        await WinerySettings.update({ enableSecureLinks: true }, { where: { wineryId } });
    });
});
