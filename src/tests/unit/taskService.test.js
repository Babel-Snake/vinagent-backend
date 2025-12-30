// src/tests/unit/taskService.test.js
// Unit tests for taskService

const taskService = require('../../services/taskService');

// Mock dependencies BEFORE requiring the module
jest.mock('../../models', () => ({
    Task: {
        findOne: jest.fn(),
        findByPk: jest.fn(),
        update: jest.fn(),
        findAndCountAll: jest.fn(),
        sequelize: {
            transaction: jest.fn(async () => ({
                commit: jest.fn(),
                rollback: jest.fn()
            }))
        }
    },
    TaskAction: {
        create: jest.fn()
    },
    Member: {
        findByPk: jest.fn()
    },
    WinerySettings: {
        findOne: jest.fn()
    }
}));

jest.mock('../../config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

jest.mock('../../services/execution.service', () => ({
    executeTask: jest.fn()
}));

jest.mock('../../services/audit.service', () => ({
    logTaskAction: jest.fn()
}));

const { Task, TaskAction, WinerySettings } = require('../../models');
const executionService = require('../../services/execution.service');

describe('TaskService Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTask', () => {
        const mockTask = {
            id: 1,
            status: 'PENDING_REVIEW',
            type: 'ADDRESS_CHANGE',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            wineryId: 100,
            payload: { addressLine1: '123 Test St' },
            save: jest.fn().mockResolvedValue(true),
            changed: jest.fn().mockReturnValue(['status'])
        };

        const defaultParams = {
            taskId: 1,
            wineryId: 100,
            userId: 7,
            userRole: 'manager'
        };

        beforeEach(() => {
            // Default mock setup
            WinerySettings.findOne.mockResolvedValue({ enableSecureLinks: true });
            executionService.executeTask.mockResolvedValue({ success: true });
        });

        it('should throw error if task not found', async () => {
            Task.findOne.mockResolvedValue(null);

            await expect(taskService.updateTask({
                ...defaultParams,
                updates: { status: 'APPROVED' }
            })).rejects.toThrow('Task not found');
        });

        it('should allow transition to REJECTED without payload', async () => {
            const task = {
                ...mockTask,
                payload: null,
                save: jest.fn().mockResolvedValue(true),
                changed: jest.fn().mockReturnValue(['status'])
            };
            Task.findOne.mockResolvedValue(task);

            await taskService.updateTask({
                ...defaultParams,
                updates: { status: 'REJECTED' }
            });

            expect(task.save).toHaveBeenCalled();
        });

        it('should block transition to APPROVED if payload validation fails', async () => {
            // Mock task with ADDRESS_CHANGE but invalid/empty payload
            const invalidTask = {
                ...mockTask,
                payload: {}, // Missing required fields
                type: 'ADDRESS_CHANGE',
                save: jest.fn()
            };
            Task.findOne.mockResolvedValue(invalidTask);

            await expect(taskService.updateTask({
                ...defaultParams,
                updates: { status: 'APPROVED' }
            })).rejects.toThrow('Cannot approve');
        });

        it('should allow transition to APPROVED if payload valid', async () => {
            const validTask = {
                ...mockTask,
                payload: { addressLine1: '123 Fake St', suburb: 'Test', postcode: '5000' },
                memberId: 42,
                save: jest.fn().mockResolvedValue(true),
                changed: jest.fn().mockReturnValue(['status'])
            };
            Task.findOne.mockResolvedValue(validTask);
            WinerySettings.findOne.mockResolvedValue({ enableSecureLinks: true });
            executionService.executeTask.mockResolvedValue({ success: true, tokenId: 123 });

            const result = await taskService.updateTask({
                ...defaultParams,
                updates: { status: 'APPROVED' }
            });

            expect(validTask.save).toHaveBeenCalled();
        });

        it('should prevent staff from approving tasks', async () => {
            Task.findOne.mockResolvedValue({ ...mockTask });

            await expect(taskService.updateTask({
                ...defaultParams,
                userRole: 'staff',
                updates: { status: 'APPROVED' }
            })).rejects.toThrow('Staff cannot approve');
        });
    });

    describe('getTasksForWinery', () => {
        it('should return paginated tasks', async () => {
            Task.findAndCountAll.mockResolvedValue({
                count: 1,
                rows: [{ id: 1, status: 'PENDING_REVIEW' }]
            });

            const result = await taskService.getTasksForWinery({
                wineryId: 1,
                userId: 7,
                userRole: 'manager',
                pagination: { page: 1, pageSize: 10 }
            });

            expect(result.tasks.length).toBe(1);
            expect(result.pagination.total).toBe(1);
            expect(Task.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 10,
                offset: 0,
                where: { wineryId: 1 }
            }));
        });
    });
});
