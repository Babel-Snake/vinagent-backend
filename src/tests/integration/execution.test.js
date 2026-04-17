// src/tests/integration/execution.test.js
// Tests for task execution triggers and automation

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Task, Winery, User, TaskAction, WinerySettings, MemberActionToken } = require('../../models');

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

    it('should trigger stub execution when an ORDER task is actioned', async () => {
        const taskService = require('../../services/taskService');

        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING',
            payload: { orderId: '123' },
            createdBy: userId
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'ACTIONED' }
        });

        const updatedTask = await Task.findByPk(task.id);
        expect(updatedTask.status).toBe('ACTIONED');

        const actions = await TaskAction.findAll({ where: { taskId: task.id } });
        const actionedByUser = actions.find(
            (action) => action.actionType === 'ACTIONED' && action.userId === userId
        );
        const executionAction = actions.find(
            (action) => action.actionType === 'ACTIONED' && action.details?.action === 'ORDER_UPDATE_STUB'
        );

        expect(actionedByUser).toBeDefined();
        expect(executionAction).toBeDefined();
        expect(executionAction.details.action).toBe('ORDER_UPDATE_STUB');
    });

    it('should keep the task actioned if address automation validation fails', async () => {
        const taskService = require('../../services/taskService');

        const task = await Task.create({
            wineryId,
            type: 'ADDRESS_CHANGE',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            status: 'PENDING',
            payload: {},
            memberId: null
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'ACTIONED' }
        });

        const updatedTask = await Task.findByPk(task.id);
        const token = await MemberActionToken.findOne({ where: { taskId: task.id } });

        expect(updatedTask.status).toBe('ACTIONED');
        expect(token).toBeNull();
    });

    it('should skip automation when secure links are disabled', async () => {
        const taskService = require('../../services/taskService');

        await WinerySettings.update({ enableSecureLinks: false }, { where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING',
            payload: { orderId: '456' },
            createdBy: userId
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'ACTIONED' }
        });

        const updatedTask = await Task.findByPk(task.id);
        expect(updatedTask.status).toBe('ACTIONED');

        const actions = await TaskAction.findAll({ where: { taskId: task.id } });
        const executionAction = actions.find((action) => action.details?.action === 'ORDER_UPDATE_STUB');
        expect(executionAction).toBeUndefined();

        await WinerySettings.update({ enableSecureLinks: true }, { where: { wineryId } });
    });
});
