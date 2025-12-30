// src/tests/unit/memberActionTokenService.test.js
const memberActionTokenService = require('../../services/memberActionTokenService');
const { MemberActionToken } = require('../../models');

jest.mock('../../models', () => ({
    MemberActionToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn()
    },
    Member: {},
    Task: {}
}));

// Mock Logger to silence output
jest.mock('../../config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('memberActionTokenService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createToken', () => {
        it('should create a token with correct expiry', async () => {
            MemberActionToken.create.mockResolvedValue({ id: 1 });

            await memberActionTokenService.createToken({
                memberId: 1,
                wineryId: 1,
                type: 'ADDRESS_CHANGE'
            });

            expect(MemberActionToken.create).toHaveBeenCalledWith(expect.objectContaining({
                memberId: 1,
                type: 'ADDRESS_CHANGE',
                token: expect.any(String),
                expiresAt: expect.any(Date)
            }), expect.anything());

            // Check expiry is approx 7 days
            const args = MemberActionToken.create.mock.calls[0][0];
            const now = new Date();
            const diffDays = (args.expiresAt - now) / (1000 * 60 * 60 * 24);
            // Jest closeTo check (7 days +/- 0.1)
            expect(diffDays).toBeCloseTo(7, 0);
        });
    });

    describe('validateToken', () => {
        it('should return token, member, and task for valid token', async () => {
            const mockRecord = {
                id: 1,
                token: 'valid',
                expiresAt: new Date(Date.now() + 100000), // Future
                usedAt: null,
                Member: { id: 10 },
                Task: { id: 20 }
            };
            MemberActionToken.findOne.mockResolvedValue(mockRecord);

            const result = await memberActionTokenService.validateToken('valid');
            expect(result.tokenRecord).toBe(mockRecord);
            expect(result.member.id).toBe(10);
            expect(result.task.id).toBe(20);
        });

        it('should throw TOKEN_NOT_FOUND for unknown token', async () => {
            MemberActionToken.findOne.mockResolvedValue(null);
            await expect(memberActionTokenService.validateToken('unknown'))
                .rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
        });

        it('should throw TOKEN_EXPIRED for expired token', async () => {
            MemberActionToken.findOne.mockResolvedValue({
                id: 1,
                expiresAt: new Date(Date.now() - 100000), // Past
                usedAt: null
            });
            await expect(memberActionTokenService.validateToken('expired'))
                .rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        });

        it('should throw TOKEN_ALREADY_USED for used token', async () => {
            MemberActionToken.findOne.mockResolvedValue({
                id: 1,
                expiresAt: new Date(Date.now() + 100000),
                usedAt: new Date()
            });
            await expect(memberActionTokenService.validateToken('used'))
                .rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
        });
    });

    describe('markTokenUsed', () => {
        it('should set usedAt timestamp', async () => {
            await memberActionTokenService.markTokenUsed(123);
            expect(MemberActionToken.update).toHaveBeenCalledWith(
                { usedAt: expect.any(Date) },
                { where: { id: 123 }, transaction: undefined }
            );
        });
    });
});
