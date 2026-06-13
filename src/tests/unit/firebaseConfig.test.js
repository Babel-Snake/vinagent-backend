describe('Firebase configuration', () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
    };

    function restoreEnv() {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }

    function mockFirebaseAdmin() {
        const initializeApp = jest.fn();
        const cert = jest.fn((serviceAccount) => ({ serviceAccount }));

        jest.doMock('firebase-admin', () => ({
            apps: [],
            initializeApp,
            credential: { cert }
        }));
        jest.doMock('../../config/logger', () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }));

        return { initializeApp, cert };
    }

    afterEach(() => {
        jest.resetModules();
        jest.restoreAllMocks();
        restoreEnv();
    });

    test('initializes Firebase Admin from environment credentials', () => {
        process.env.NODE_ENV = 'test';
        process.env.FIREBASE_PROJECT_ID = 'env-project';
        process.env.FIREBASE_CLIENT_EMAIL = 'firebase-admin@example.test';
        process.env.FIREBASE_PRIVATE_KEY = 'line-one\\nline-two';

        const { initializeApp, cert } = mockFirebaseAdmin();

        require('../../config/firebase');

        expect(cert).toHaveBeenCalledWith({
            project_id: 'env-project',
            client_email: 'firebase-admin@example.test',
            private_key: 'line-one\nline-two'
        });
        expect(initializeApp).toHaveBeenCalledWith({
            credential: { serviceAccount: expect.objectContaining({ project_id: 'env-project' }) },
            projectId: 'env-project'
        });
    });

    test('does not fall back to the local service account file when env credentials are partial in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.FIREBASE_PROJECT_ID = 'env-project';
        process.env.FIREBASE_CLIENT_EMAIL = '';
        process.env.FIREBASE_PRIVATE_KEY = '';

        mockFirebaseAdmin();
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit:${code}`);
        });

        expect(() => require('../../config/firebase')).toThrow('process.exit:1');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
