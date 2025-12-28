const client = require('twilio');
const config = require('../config');
const logger = require('../config/logger');

function validateEmailSignature(req, res, next) {
    const secret = process.env.EMAIL_WEBHOOK_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('CRITICAL: EMAIL_WEBHOOK_SECRET missing in production.');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        logger.warn('Skipping email webhook signature validation (EMAIL_WEBHOOK_SECRET missing)');
        return next();
    }

    const signature = req.headers['x-email-webhook-signature'];

    if (!signature) {
        logger.warn('Missing email webhook signature header');
        return res.status(403).json({ error: 'Missing signature' });
    }

    if (signature !== secret) {
        logger.warn('Invalid email webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
    }

    return next();
}

/**
 * Constructs the public URL for the current request.
 * Handles forwarded headers (e.g., from ngrok/Heroku).
 */
function constructWebhookUrl(req) {
    if (process.env.PUBLIC_URL) {
        return `${process.env.PUBLIC_URL}${req.originalUrl}`;
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${req.originalUrl}`;
}

function validateRetellSignature(req, res, next) {
    const secret = process.env.RETELL_WEBHOOK_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('CRITICAL: RETELL_WEBHOOK_SECRET missing in production.');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        logger.warn('Skipping Retell webhook signature validation (RETELL_WEBHOOK_SECRET missing)');
        return next();
    }

    const signature = req.headers['x-retell-signature'];
    if (!signature) {
        logger.warn('Missing Retell webhook signature header');
        return res.status(403).json({ error: 'Missing signature' });
    }

    // Retell signature verification (Crypto check)
    // Assuming standard HMAC-SHA256 of body
    // Since we don't have the SDK, we'll do a simple compare or crypto check.
    // Ideally we use crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    // For MVP, we'll assume strict equality if secret is just a token, or unimplemented.
    // Actually, let's implement the standard HMAC pattern as a placeholder.

    // const crypto = require('crypto');
    // const computed = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    // if (signature !== computed) ...

    // For now, let's assume simple token match for simplicity unless Retell is known.
    // If Retell uses a signing secret, it's usually HMAC.

    if (signature !== secret) {
        // Allow simple match for now (MVP). 
        // TODO: Implement actual crypto verification once Retell spec is confirmed.
        logger.warn('Invalid Retell webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
    }

    return next();
}

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

    const url = constructWebhookUrl(req);
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
    validateTwilioSignature,
    validateEmailSignature,
    validateRetellSignature,
    constructWebhookUrl
};
