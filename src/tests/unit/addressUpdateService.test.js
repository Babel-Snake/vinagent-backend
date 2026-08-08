// src/tests/unit/addressUpdateService.test.js
const addressUpdateService = require('../../services/addressUpdateService');
const memberActionTokenService = require('../../services/memberActionTokenService');
const { TaskAction } = require('../../models');

jest.mock('../../services/memberActionTokenService');
jest.mock('../../models', () => ({
    Member: {
        sequelize: {
            transaction: jest.fn(async () => {
                const t = {
                    commit: jest.fn(),
                    rollback: jest.fn()
                };
                return t;
            })
        }
    },
    Task: {},
    TaskAction: { create: jest.fn() }
}));

describe('addressUpdateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('confirmAddress', () => {
        it('should update member address with valid token', async () => {
            const mockMember = {
                id: 42,
                firstName: 'Emma',
                lastName: 'Clarke',
                addressLine1: 'Old Address',
                save: jest.fn().mockResolvedValue(true)
            };

            const mockTask = {
                id: 5001,
                status: 'PENDING',
                save: jest.fn().mockResolvedValue(true)
            };

            const mockToken = {
                id: 8001,
                payload: {
                    addressLine1: '12 Oak Street',
                    suburb: 'Stirling',
                    postcode: '5152'
                }
            };

            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: mockToken,
                member: mockMember,
                task: mockTask
            });
            memberActionTokenService.markTokenUsed.mockResolvedValue();

            const result = await addressUpdateService.confirmAddress({
                token: 'test-token'
            });

            expect(memberActionTokenService.validateToken).toHaveBeenCalledWith('test-token', {
                expectedType: 'ADDRESS_CHANGE',
                transaction: expect.anything(),
                lock: true
            });
            expect(result.member.id).toBe(42);
            expect(mockMember.save).toHaveBeenCalled();
            expect(mockMember.addressLine1).toBe('12 Oak Street');

            expect(mockTask.status).toBe('ACTIONED');
            expect(mockTask.save).toHaveBeenCalled();

            expect(memberActionTokenService.markTokenUsed).toHaveBeenCalledWith(8001, expect.anything());
            expect(TaskAction.create).toHaveBeenCalledWith(expect.objectContaining({
                actionType: 'ACTIONED',
                taskId: 5001
            }), expect.anything());
        });

        it('should throw error if no address to apply', async () => {
            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: { id: 1, payload: {} },
                member: { id: 1 },
                task: null
            });

            await expect(
                addressUpdateService.confirmAddress({ token: 'test' })
            ).rejects.toMatchObject({
                code: 'NO_ADDRESS'
            });
        });

        it('should roll back when token relationship validation fails', async () => {
            const invalidTokenError = Object.assign(new Error('Invalid token context'), {
                code: 'INVALID_TOKEN_CONTEXT'
            });
            memberActionTokenService.validateToken.mockRejectedValue(invalidTokenError);

            await expect(
                addressUpdateService.confirmAddress({ token: 'test' })
            ).rejects.toMatchObject({
                code: 'INVALID_TOKEN_CONTEXT'
            });
        });

        it('rejects non-string address values', async () => {
            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: { id: 1, payload: { addressLine1: 'Test' } },
                member: { id: 1 },
                task: null
            });

            await expect(addressUpdateService.confirmAddress({
                token: 'test',
                newAddress: { addressLine1: { unexpected: true } }
            })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
        });
    });
});
