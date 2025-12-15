const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const logger = require('./logger');

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id // Explicitly set projectId
        });
        logger.info('Firebase Admin Initialized successfully.');
    }
} catch (error) {
    logger.error('Firebase Admin Initialization Failed:', error);
}

module.exports = admin;
