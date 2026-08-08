// src/tests/unit/taskService.test.js
// Unit tests for taskService

const taskService = require('../../services/taskService');

// Mock dependencies BEFORE requiring the module
jest.mock('../../models', () => ({
    Task: {
        findOne: jest.fn(),
        findByPk: jest.fn(),
        findAll: jest.fn(),
        update: jest.fn(),
        findAndCountAll: jest.fn(),
        sequelize: {
            transaction: jest.fn(async () => ({
                commit: jest.fn(),
                rollback: jest.fn()
            }))
        }
    },
    TaskStep: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn()
    },
    TaskAction: {
        create: jest.fn()
    },
    Member: {
        findByPk: jest.fn()
    },
    WinerySettings: {
        findOne: jest.fn()
    },
    User: {
        findOne: jest.fn(),
        findByPk: jest.fn(),
        findAll: jest.fn()
    },
    Notification: {
        create: jest.fn(),
        findAll: jest.fn()
    },
    Project: {},
    ProjectItem: {
        findAll: jest.fn()
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

const { Task, TaskStep, WinerySettings, Notification, ProjectItem } = require('../../models');
const executionService = require('../../services/execution.service');

describe('TaskService Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        Task.findAll.mockResolvedValue([]);
        TaskStep.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([]);
        ProjectItem.findAll.mockResolvedValue([]);
    });

    describe('updateTask', () => {
        const mockTask = {
            id: 1,
            status: 'PENDING',
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
                updates: { status: 'ACTIONED' }
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

        it('should roll back the status change when execution fails after actioning', async () => {
            const invalidTask = {
                ...mockTask,
                payload: {},
                save: jest.fn().mockResolvedValue(true),
                changed: jest.fn().mockReturnValue(['status'])
            };
            const transaction = {
                commit: jest.fn(),
                rollback: jest.fn(),
                finished: false
            };
            Task.sequelize.transaction.mockResolvedValueOnce(transaction);
            Task.findOne.mockResolvedValue(invalidTask);
            executionService.executeTask.mockRejectedValue(new Error('execution failed'));

            await expect(taskService.updateTask({
                ...defaultParams,
                updates: { status: 'ACTIONED' }
            })).rejects.toMatchObject({
                statusCode: 502,
                code: 'EXECUTION_FAILED'
            });

            expect(invalidTask.save).toHaveBeenCalled();
            expect(transaction.rollback).toHaveBeenCalled();
            expect(transaction.commit).not.toHaveBeenCalled();
        });

        it('should allow transition to ACTIONED if payload is valid', async () => {
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
                updates: { status: 'ACTIONED' }
            });

            expect(validTask.save).toHaveBeenCalled();
            expect(executionService.executeTask).toHaveBeenCalled();
            expect(result.status).toBe('ACTIONED');
        });

        it('should prevent staff from rejecting tasks', async () => {
            Task.findOne.mockResolvedValue({ ...mockTask });

            await expect(taskService.updateTask({
                ...defaultParams,
                userRole: 'staff',
                updates: { status: 'REJECTED' }
            })).rejects.toThrow('Staff cannot reject tasks');
        });
    });

    describe('getTasksForWinery', () => {
        it('should return paginated tasks', async () => {
            Task.findAndCountAll.mockResolvedValue({
                count: 1,
                rows: [{ id: 1, status: 'PENDING' }]
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
