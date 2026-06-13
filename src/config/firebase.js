const admin = require('firebase-admin');
require('dotenv').config();
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

// --- FAIL-FAST: Validate Firebase Credentials ---
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;
let serviceAccountSource = null;

function normalizePrivateKey(privateKey) {
    return String(privateKey || '').replace(/\\n/g, '\n');
}

function loadServiceAccountFromEnv() {
    const envServiceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        client_email: process.env.FIREBASE_CLIENT_EMAIL
    };
    const hasAnyEnvCredential = Object.values(envServiceAccount).some(Boolean);
    if (!hasAnyEnvCredential) return null;

    const missing = Object.entries(envServiceAccount)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Firebase env credentials missing required fields: ${missing.join(', ')}`);
    }

    return envServiceAccount;
}

function loadServiceAccountFromFile() {
    if (!fs.existsSync(serviceAccountPath)) return null;
    return require('./serviceAccountKey.json');
}

function validateServiceAccount(candidate) {
    if (!candidate) {
        throw new Error('Firebase credentials not found in environment variables or serviceAccountKey.json');
    }

    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missing = requiredFields.filter(field => !candidate[field]);

    if (missing.length > 0) {
        throw new Error(`Firebase service account missing required fields: ${missing.join(', ')}`);
    }
}

try {
    const envServiceAccount = loadServiceAccountFromEnv();
    if (envServiceAccount) {
        serviceAccount = envServiceAccount;
        serviceAccountSource = 'environment';
    } else {
        serviceAccount = loadServiceAccountFromFile();
        serviceAccountSource = 'serviceAccountKey.json';
    }
    validateServiceAccount(serviceAccount);
} catch (loadError) {
    logger.error('Firebase Configuration Error:', loadError.message);
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: Firebase configuration is invalid. Exiting.');
        process.exit(1);
    } else {
        logger.warn('Firebase disabled - running in degraded mode (dev only)');
        serviceAccount = null;
    }
}

function initializeFirebase(serviceAccountToUse, source) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountToUse),
        projectId: serviceAccountToUse.project_id
    });
    logger.info('Firebase Admin Initialized successfully.', { credentialSource: source });
}

// Initialize Firebase Admin
try {
    if (serviceAccount && !admin.apps.length) {
        initializeFirebase(serviceAccount, serviceAccountSource);
    }
} catch (error) {
    if (process.env.NODE_ENV === 'production') {
        logger.error('Firebase Admin Initialization Failed:', error);
        process.exit(1);
    } else if (serviceAccountSource === 'environment') {
        logger.warn('Firebase Admin initialization from env failed; retrying local fallback.', {
            error: error.message
        });
        try {
            const localServiceAccount = loadServiceAccountFromFile();
            if (localServiceAccount && !admin.apps.length) {
                validateServiceAccount(localServiceAccount);
                logger.warn('Retrying Firebase Admin initialization with local serviceAccountKey.json fallback.');
                initializeFirebase(localServiceAccount, 'serviceAccountKey.json');
            }
        } catch (fallbackError) {
            logger.warn('Firebase local service account fallback failed.', { error: fallbackError.message });
        }
    } else {
        logger.error('Firebase Admin Initialization Failed:', error);
    }
}

module.exports = admin;
