describe('authMiddleware active user enforcement', () => {
    const originalDeploymentWineryId = process.env.DEPLOYMENT_WINERY_ID;

    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        if (originalDeploymentWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
        else process.env.DEPLOYMENT_WINERY_ID = originalDeploymentWineryId;
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

    it('binds a Firebase token to the stored UID rather than its mutable email', async () => {
        const findOne = jest.fn().mockResolvedValue({
            id: 11,
            firebaseUid: 'firebase-user-id',
            email: 'stored@example.com',
            displayName: 'Stored User',
            role: 'manager',
            wineryId: 1,
            isActive: true,
            Winery: { name: 'Test Winery' }
        });
        jest.doMock('../../config/firebase', () => ({
            auth: () => ({
                verifyIdToken: jest.fn().mockResolvedValue({
                    uid: 'firebase-user-id',
                    email: 'changed-in-firebase@example.com',
                    iss: 'https://securetoken.google.com/test-project',
                    aud: 'test-project'
                })
            })
        }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn()
        }));
        jest.doMock('../../config', () => ({
            firebase: { projectId: 'test-project' },
            auth: { expectedIssuerPrefix: 'https://securetoken.google.com/' }
        }));
        jest.doMock('../../models', () => ({ Winery: {}, User: { findOne } }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = { headers: { authorization: 'Bearer firebase-token' } };
        const res = createResponse();
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { firebaseUid: 'firebase-user-id' }
        }));
        expect(req.user.email).toBe('stored@example.com');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not fall back to email when the Firebase UID is unknown', async () => {
        const findOne = jest.fn().mockResolvedValue(null);
        jest.doMock('../../config/firebase', () => ({
            auth: () => ({
                verifyIdToken: jest.fn().mockResolvedValue({
                    uid: 'unregistered-uid',
                    email: 'existing@example.com',
                    iss: 'https://securetoken.google.com/test-project',
                    aud: 'test-project'
                })
            })
        }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn()
        }));
        jest.doMock('../../config', () => ({
            firebase: { projectId: 'test-project' },
            auth: { expectedIssuerPrefix: 'https://securetoken.google.com/' }
        }));
        jest.doMock('../../models', () => ({ Winery: {}, User: { findOne } }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = { headers: { authorization: 'Bearer firebase-token' } };
        const res = createResponse();
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { firebaseUid: 'unregistered-uid' }
        }));
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('does not include bearer-token material in failed-auth logs', async () => {
        const warn = jest.fn();
        jest.doMock('../../config/firebase', () => ({
            auth: () => ({ verifyIdToken: jest.fn().mockRejectedValue(new Error('bad token')) })
        }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(), warn, error: jest.fn(), info: jest.fn()
        }));
        jest.doMock('../../config', () => ({
            firebase: { projectId: 'test-project' },
            auth: { expectedIssuerPrefix: 'https://securetoken.google.com/' }
        }));
        jest.doMock('../../models', () => ({ Winery: {}, User: { findOne: jest.fn() } }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = {
            headers: {
                authorization: 'Bearer super-secret-token-value',
                'user-agent': 'test-agent'
            },
            ip: '127.0.0.1'
        };
        const res = createResponse();

        await authMiddleware(req, res, jest.fn());

        expect(JSON.stringify(warn.mock.calls)).not.toContain('super-secret-token-value');
        expect(JSON.stringify(warn.mock.calls)).not.toContain('token_prefix');
        expect(res.statusCode).toBe(401);
    });

    it('revokes existing PIN sessions when the PIN is rotated', async () => {
        jest.doMock('../../config/firebase', () => ({ auth: jest.fn() }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn()
        }));
        jest.doMock('../../utils/pinAuth', () => ({
            verifyPinSessionToken: jest.fn().mockReturnValue({
                sub: 10,
                wineryId: 1,
                role: 'staff',
                authMode: 'pin',
                iat: 100
            })
        }));
        jest.doMock('../../models', () => ({
            Winery: {},
            User: {
                findOne: jest.fn().mockResolvedValue({
                    id: 10,
                    wineryId: 1,
                    isActive: true,
                    pinHash: 'scrypt$rotated$safely',
                    pinUpdatedAt: new Date(102_000),
                    Winery: { name: 'Test Winery' }
                })
            }
        }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = { headers: { authorization: 'Bearer pin.old-session.signature' } };
        const res = createResponse();
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a valid Firebase user assigned to another deployment winery', async () => {
        process.env.DEPLOYMENT_WINERY_ID = '1';
        jest.doMock('../../config/firebase', () => ({
            auth: () => ({
                verifyIdToken: jest.fn().mockResolvedValue({
                    uid: 'foreign-winery-user',
                    email: 'manager@other-winery.example',
                    iss: 'https://securetoken.google.com/test-project',
                    aud: 'test-project'
                })
            })
        }));
        jest.doMock('../../config/logger', () => ({
            debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn()
        }));
        jest.doMock('../../config', () => ({
            firebase: { projectId: 'test-project' },
            auth: { expectedIssuerPrefix: 'https://securetoken.google.com/' }
        }));
        jest.doMock('../../models', () => ({
            Winery: {},
            User: {
                findOne: jest.fn().mockResolvedValue({
                    id: 20,
                    firebaseUid: 'foreign-winery-user',
                    email: 'manager@other-winery.example',
                    displayName: 'Other Manager',
                    role: 'manager',
                    wineryId: 2,
                    isActive: true,
                    Winery: { name: 'Other Winery' }
                })
            }
        }));

        const { authMiddleware } = require('../../middleware/authMiddleware');
        const req = { headers: { authorization: 'Bearer valid-firebase-token' } };
        const res = createResponse();
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(res.statusCode).toBe(403);
        expect(res.body.error.code).toBe('ACCESS_DENIED');
        expect(next).not.toHaveBeenCalled();
    });
});
