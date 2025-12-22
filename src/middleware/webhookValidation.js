const client = require('twilio');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Validates that the incoming request is from Twilio
 */
function validateTwilioSignature(req, res, next) {
    const authToken = config.twilio.authToken;

    // In Dev/Test, if no token provided, we can warn and skip
    // But in Production, we must enforce it.
    if (!authToken) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('CRITICAL: Twilio Auth Token missing in production. Cannot validate webhook signature.');
            return res.status(500).json({ error: 'Server configuration error' });
        } else {
            logger.warn('Skipping Twilio signature validation (TWILIO_AUTH_TOKEN missing)');
            return next();
        }
    }

    const signature = req.headers['x-twilio-signature'];
    if (!signature) {
        logger.warn('Missing Twilio Signature header');
        return res.status(403).json({ error: 'Missing signature' });
    }

    // Construct the URL. 
    // In production (e.g. Heroku/AWS), we need to trust x-forwarded headers or use configured public URL.
    // For VinAgent, let's assume standard Express behavior or a configured override.
    // If process.env.PUBLIC_URL is set, we use that base.

    let url = '';
    if (process.env.PUBLIC_URL) {
        url = `${process.env.PUBLIC_URL}${req.originalUrl}`;
    } else {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        url = `${protocol}://${host}${req.originalUrl}`;
    }

    const params = req.body || {};

    try {
        const isValid = client.validateRequest(authToken, signature, url, params);
        if (isValid) {
            return next();
        } else {
            logger.warn('Invalid Twilio Signature', { signature, url });
            return res.status(403).json({ error: 'Invalid signature' });
        }
    } catch (err) {
        logger.error('Error validating Twilio signature', err);
        return res.status(500).json({ error: 'Validation error' });
    }
}

module.exports = {
    validateTwilioSignature
};
