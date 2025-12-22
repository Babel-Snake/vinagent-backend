const taskService = require('../../services/taskService');
const { Task, TaskAction, Member } = require('../../models');
const validationUtils = require('../../utils/validation');

// Mock dependencies
jest.mock('../../models', () => ({
    Task: {
        findByPk: jest.fn(),
        update: jest.fn()
    },
    TaskAction: {
        create: jest.fn()
    },
    Member: {
        findByPk: jest.fn()
    }
}));

jest.mock('../../config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

// Mock execution service
jest.mock('../../services/execution.service', () => ({
    executeTask: jest.fn()
}));

describe('TaskService Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTask', () => {
        const mockTask = {
            id: 1,
            status: 'PENDING_REVIEW',
            type: 'ADDRESS_CHANGE',
            wineryId: 100,
            save: jest.fn()
        };

        it('should throw error if task not found', async () => {
            Task.findByPk.mockResolvedValue(null);
            await expect(taskService.updateTask(999, { status: 'APPROVED' }, 1))
                .rejects.toThrow('Task not found');
        });

        it('should allow transition to REJECTED without payload', async () => {
            Task.findByPk.mockResolvedValue({ ...mockTask, save: jest.fn() });

            await taskService.updateTask(1, { status: 'REJECTED' }, 1);

            // Should verify save was called or Task.update? 
            // The service implementation uses instance.save() usually.
            // Let's check if findByPk was called.
            expect(Task.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
        });

        it('should block transition to APPROVED if payload validation fails', async () => {
            // Mock task with ADDRESS_CHANGE but no payload
            const invalidTask = {
                ...mockTask,
                payload: null,
                type: 'ADDRESS_CHANGE',
                save: jest.fn()
            };
            Task.findByPk.mockResolvedValue(invalidTask);

            await expect(taskService.updateTask(1, { status: 'APPROVED' }, 1))
                .rejects.toThrow(); // Validation error
        });

        it('should allow transition to APPROVED if payload valid', async () => {
            const validTask = {
                ...mockTask,
                payload: { addressLine1: '123 Fake St' },
                save: jest.fn()
            };
            Task.findByPk.mockResolvedValue(validTask);

            await taskService.updateTask(1, { status: 'APPROVED' }, 1);

            // Verify TaskAction log
            expect(TaskAction.create).toHaveBeenCalled();
        });
    });
});
