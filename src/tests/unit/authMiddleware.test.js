describe('authMiddleware active user enforcement', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    function createResponse() {
        return {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            }
        };
    }

    it('returns ACCESS_DENIED for inactive Firebase-backed users', async () => {
        jest.doMock('../../config/firebase', () => ({
            auth: () => ({
                verifyIdToken: jest.fn().mockResolvedValue({
                    uid: 'firebase-user-id',
                    email: 'inactive@example.com',
                    iss: 'https://securetoken.google.com/test-project',
                    aud: 'test-project'
                })
            })
        }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn()
        }));
        jest.doMock('../../config', () => ({
            firebase: { projectId: 'test-project' },
            auth: { expectedIssuerPrefix: 'https://securetoken.google.com/' }
        }));
        jest.doMock('../../models', () => ({
            Winery: {},
            User: {
                findOne: jest.fn().mockResolvedValue({
                    id: 10,
                    email: 'inactive@example.com',
                    displayName: 'Inactive User',
                    role: 'manager',
                    wineryId: 1,
                    isActive: false,
                    Winery: { name: 'Test Winery' }
                })
            }
        }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = { headers: { authorization: 'Bearer firebase-token' } };
        const res = createResponse();
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.error.code).toBe('ACCESS_DENIED');
    });
});
