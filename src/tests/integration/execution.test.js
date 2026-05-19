// src/tests/integration/execution.test.js
// Tests for task execution triggers and automation

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Task, Winery, User, TaskAction, WinerySettings, Member, MemberActionToken, Message } = require('../../models');

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

        await Member.create({
            firstName: 'Execution',
            lastName: 'Member',
            email: 'member@test.com',
            phone: '+61411111111',
            wineryId
        });

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

    it('should write an order update into the CRM-backed execution trail when an ORDER task is actioned', async () => {
        const taskService = require('../../services/taskService');
        const member = await Member.findOne({ where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING',
            payload: { orderId: '123' },
            memberId: member.id,
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
        const writebackAction = actions.find(
            (action) => action.actionType === 'ACTIONED' && action.details?.action === 'ORDER_WRITEBACK'
        );
        const executionAudit = actions.find(
            (action) => action.actionType === 'EXECUTION_RECORDED' && action.details?.operation === 'crm_writeback'
        );

        expect(actionedByUser).toBeDefined();
        expect(writebackAction).toBeDefined();
        expect(writebackAction.details.action).toBe('ORDER_WRITEBACK');
        expect(executionAudit).toBeDefined();
        expect(executionAudit.details.status).toBe('RECORDED');

        const refreshedTask = await Task.findByPk(task.id);
        expect(refreshedTask.payload.orderWriteback.referenceCode).toMatch(/^CRM-/);
        expect(Array.isArray(refreshedTask.payload.executionResults)).toBe(true);
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

    it('should skip secure-link execution when secure links are disabled', async () => {
        const taskService = require('../../services/taskService');
        const member = await Member.findOne({ where: { wineryId } });

        await WinerySettings.update({ enableSecureLinks: false }, { where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'ADDRESS_CHANGE',
            category: 'ACCOUNT',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            status: 'PENDING',
            memberId: member.id,
            payload: {
                addressLine1: '22 New Street',
                suburb: 'Adelaide',
                state: 'SA',
                postcode: '5000'
            },
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
        const token = await MemberActionToken.findOne({ where: { taskId: task.id } });
        expect(updatedTask.status).toBe('ACTIONED');
        expect(token).toBeNull();

        const actions = await TaskAction.findAll({ where: { taskId: task.id } });
        const executionAction = actions.find(
            (action) => action.actionType === 'EXECUTION_RECORDED' && action.details?.kind === 'address_change'
        );
        expect(executionAction).toBeDefined();
        expect(executionAction.details.status).toBe('SKIPPED');

        await WinerySettings.update({ enableSecureLinks: true }, { where: { wineryId } });
    });

    it('should log outbound notifications onto the task communication timeline', async () => {
        const taskService = require('../../services/taskService');
        const member = await Member.findOne({ where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'ORDER_SHIPPING_DELAY',
            category: 'ORDER',
            subType: 'ORDER_SHIPPING_DELAY',
            status: 'PENDING',
            payload: { orderId: '789' },
            memberId: member.id,
            suggestedChannel: 'sms',
            suggestedReplyBody: 'Your order is delayed but on the way.',
            createdBy: userId
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'ACTIONED' }
        });

        const outboundMessage = await Message.findOne({
            where: {
                taskId: task.id,
                wineryId,
                direction: 'outbound'
            }
        });

        expect(outboundMessage).not.toBeNull();
        expect(outboundMessage.source).toBe('sms');
        expect(outboundMessage.body).toContain('Your order is delayed');
    });

    it('should log outbound email notifications with a subject onto the task communication timeline', async () => {
        const taskService = require('../../services/taskService');
        const member = await Member.findOne({ where: { wineryId } });

        const task = await Task.create({
            wineryId,
            type: 'GENERAL_QUERY',
            category: 'GENERAL',
            subType: 'GENERAL_ENQUIRY',
            status: 'PENDING',
            memberId: member.id,
            suggestedChannel: 'email',
            suggestedReplySubject: 'Your tasting enquiry',
            suggestedReplyBody: 'Thanks for reaching out. We have availability next weekend.',
            createdBy: userId
        });

        await taskService.updateTask({
            taskId: task.id,
            wineryId,
            userId,
            userRole: 'manager',
            updates: { status: 'ACTIONED' }
        });

        const outboundMessage = await Message.findOne({
            where: {
                taskId: task.id,
                wineryId,
                direction: 'outbound',
                source: 'email'
            }
        });

        expect(outboundMessage).not.toBeNull();
        expect(outboundMessage.subject).toBe('Your tasting enquiry');
        expect(outboundMessage.body).toContain('availability next weekend');
    });
});
