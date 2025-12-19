const admin = require('firebase-admin');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

// --- FAIL-FAST: Validate Firebase Credentials ---
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;

try {
    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Firebase service account file not found at: ${serviceAccountPath}`);
    }
    serviceAccount = require('./serviceAccountKey.json');

    // Validate required fields
    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missing = requiredFields.filter(field => !serviceAccount[field]);

    if (missing.length > 0) {
        throw new Error(`Firebase service account missing required fields: ${missing.join(', ')}`);
    }
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

// Initialize Firebase Admin
try {
    if (serviceAccount && !admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
        logger.info('Firebase Admin Initialized successfully.');
    }
} catch (error) {
    logger.error('Firebase Admin Initialization Failed:', error);
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

module.exports = admin;
