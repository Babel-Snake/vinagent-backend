const memberActionTokenService = require('../../services/memberActionTokenService');
const { MemberActionToken, Member, Task } = require('../../models');

jest.mock('../../models', () => ({
    MemberActionToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn()
    },
    Member: { findOne: jest.fn() },
    Task: { findOne: jest.fn() }
}));

jest.mock('../../config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const VALID_TOKEN = 'a'.repeat(64);

function validRecord(overrides = {}) {
    return {
        id: 1,
        token: null,
        tokenHash: memberActionTokenService.hashToken(VALID_TOKEN),
        type: 'ADDRESS_CHANGE',
        memberId: 10,
        wineryId: 2,
        taskId: 20,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        Member: { id: 10, wineryId: 2 },
        Task: { id: 20, memberId: 10, wineryId: 2 },
        ...overrides
    };
}

describe('memberActionTokenService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Member.findOne.mockResolvedValue({ id: 10, wineryId: 2 });
        Task.findOne.mockResolvedValue({ id: 20, memberId: 10, wineryId: 2 });
    });

    describe('createToken', () => {
        it('creates a token only after confirming the member belongs to the winery', async () => {
            MemberActionToken.create.mockResolvedValue({ id: 1 });

            const created = await memberActionTokenService.createToken({
                memberId: 10,
                wineryId: 2,
                type: 'ADDRESS_CHANGE'
            });

            expect(Member.findOne).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 10, wineryId: 2 }
            }));
            expect(MemberActionToken.create).toHaveBeenCalledWith(expect.objectContaining({
                memberId: 10,
                wineryId: 2,
                type: 'ADDRESS_CHANGE',
                token: null,
                tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                expiresAt: expect.any(Date)
            }), expect.anything());

            const args = MemberActionToken.create.mock.calls[0][0];
            expect(created.rawToken).toMatch(/^[a-f0-9]{64}$/);
            expect(args.tokenHash).toBe(memberActionTokenService.hashToken(created.rawToken));
            expect(args.tokenHash).not.toBe(created.rawToken);
            const diffDays = (args.expiresAt - new Date()) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBeCloseTo(7, 0);
        });

        it('rejects a member that is not in the token winery', async () => {
            Member.findOne.mockResolvedValue(null);

            await expect(memberActionTokenService.createToken({
                memberId: 10,
                wineryId: 2,
                type: 'ADDRESS_CHANGE'
            })).rejects.toMatchObject({ code: 'INVALID_TOKEN_CONTEXT' });

            expect(MemberActionToken.create).not.toHaveBeenCalled();
        });

        it('rejects a task that is not linked to the same winery and member', async () => {
            Task.findOne.mockResolvedValue(null);

            await expect(memberActionTokenService.createToken({
                memberId: 10,
                wineryId: 2,
                taskId: 20,
                type: 'ADDRESS_CHANGE'
            })).rejects.toMatchObject({ code: 'INVALID_TOKEN_CONTEXT' });

            expect(Task.findOne).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 20, wineryId: 2, memberId: 10 }
            }));
            expect(MemberActionToken.create).not.toHaveBeenCalled();
        });
    });

    describe('validateToken', () => {
        it('returns a valid token only when its member and task share the winery', async () => {
            const mockRecord = validRecord();
            MemberActionToken.findOne.mockResolvedValue(mockRecord);

            const result = await memberActionTokenService.validateToken(VALID_TOKEN, {
                expectedType: 'ADDRESS_CHANGE'
            });

            expect(result.tokenRecord).toBe(mockRecord);
            expect(result.member.id).toBe(10);
            expect(result.task.id).toBe(20);
            expect(MemberActionToken.findOne).toHaveBeenCalledWith(expect.objectContaining({
                where: { tokenHash: memberActionTokenService.hashToken(VALID_TOKEN) }
            }));
        });

        it('rejects malformed tokens before querying the database', async () => {
            await expect(memberActionTokenService.validateToken('unknown'))
                .rejects.toMatchObject({ code: 'INVALID_TOKEN' });
            expect(MemberActionToken.findOne).not.toHaveBeenCalled();
        });

        it('throws TOKEN_NOT_FOUND for an unknown well-formed token', async () => {
            MemberActionToken.findOne.mockResolvedValue(null);
            await expect(memberActionTokenService.validateToken('b'.repeat(64)))
                .rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
        });

        it('throws TOKEN_EXPIRED for an expired token', async () => {
            MemberActionToken.findOne.mockResolvedValue(validRecord({
                expiresAt: new Date(Date.now() - 100000)
            }));
            await expect(memberActionTokenService.validateToken(VALID_TOKEN))
                .rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        });

        it('throws TOKEN_ALREADY_USED for a used token', async () => {
            MemberActionToken.findOne.mockResolvedValue(validRecord({ usedAt: new Date() }));
            await expect(memberActionTokenService.validateToken(VALID_TOKEN))
                .rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
        });

        it('rejects a token for a different action type', async () => {
            MemberActionToken.findOne.mockResolvedValue(validRecord({ type: 'PREFERENCE_UPDATE' }));
            await expect(memberActionTokenService.validateToken(VALID_TOKEN, {
                expectedType: 'ADDRESS_CHANGE'
            })).rejects.toMatchObject({ code: 'INVALID_TOKEN_CONTEXT' });
        });

        it('rejects a token whose member belongs to another winery', async () => {
            MemberActionToken.findOne.mockResolvedValue(validRecord({
                Member: { id: 10, wineryId: 999 }
            }));
            await expect(memberActionTokenService.validateToken(VALID_TOKEN))
                .rejects.toMatchObject({ code: 'INVALID_TOKEN_CONTEXT' });
        });

        it('rejects a token whose task points at another member', async () => {
            MemberActionToken.findOne.mockResolvedValue(validRecord({
                Task: { id: 20, memberId: 11, wineryId: 2 }
            }));
            await expect(memberActionTokenService.validateToken(VALID_TOKEN))
                .rejects.toMatchObject({ code: 'INVALID_TOKEN_CONTEXT' });
        });
    });

    describe('markTokenUsed', () => {
        it('uses a conditional update so a token can only be consumed once', async () => {
            MemberActionToken.update.mockResolvedValue([1]);

            await memberActionTokenService.markTokenUsed(123);

            expect(MemberActionToken.update).toHaveBeenCalledWith(
                { usedAt: expect.any(Date) },
                { where: { id: 123, usedAt: null }, transaction: undefined }
            );
        });

        it('rejects a replay when no unused token row was updated', async () => {
            MemberActionToken.update.mockResolvedValue([0]);
            await expect(memberActionTokenService.markTokenUsed(123))
                .rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
        });
    });

    describe('getConfirmationUrl', () => {
        const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

        afterEach(() => {
            if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
            else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
        });

        it('uses the public frontend origin for member links', () => {
            process.env.PUBLIC_APP_URL = 'https://portal.example.test';
            expect(memberActionTokenService.getConfirmationUrl(VALID_TOKEN))
                .toBe(`https://portal.example.test/confirm-address#token=${VALID_TOKEN}`);
        });
    });
});
