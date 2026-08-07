const client = require('twilio');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../config/logger');
const {
    WineryIntegrationConfig,
    OperationalAreaIntegrationConfig,
    OperationalArea
} = require('../models');
const {
    DOMAINS,
    AREA_DOMAINS,
    digestWebhookSecret,
    parseJsonObject
} = require('../services/integrationConnection.service');

function timingSafeStringEqual(candidate, expected) {
    const candidateBuffer = Buffer.from(String(candidate || ''), 'utf8');
    const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
    return candidateBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

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

    if (!timingSafeStringEqual(signature, secret)) {
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

    try {
        const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
        const computed = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // Timing-safe comparison
        const signatureBuffer = Buffer.from(signature, 'hex');
        const computedBuffer = Buffer.from(computed, 'hex');

        if (signatureBuffer.length !== computedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
            logger.warn('Invalid Retell webhook signature');
            return res.status(403).json({ error: 'Invalid signature' });
        }

        return next();
    } catch (err) {
        logger.error('Error validating Retell signature', err);
        return res.status(500).json({ error: 'Validation error' });
    }
}

function getSingleHeader(headers, name) {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

function normalizeSignature(value) {
    const signature = String(value || '').trim();
    return signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
}

function validateHmacSignature({ secret, signature, payload }) {
    const expected = crypto
        .createHmac('sha256', String(secret || '').trim())
        .update(payload)
        .digest('hex');

    return timingSafeStringEqual(normalizeSignature(signature), expected);
}

async function validateIntegrationWebhookSignature(req, res, next) {
    try {
        const wineryId = Number.parseInt(req.params.wineryId, 10);
        const domain = String(req.params.domain || '').toLowerCase();
        const hasAreaId = req.params.areaId !== undefined;
        const areaId = hasAreaId ? Number.parseInt(req.params.areaId, 10) : null;

        if (!Number.isInteger(wineryId) || wineryId < 1 || !DOMAINS.includes(domain)) {
            return res.status(404).json({ error: 'Webhook not found' });
        }
        if (hasAreaId && (!Number.isInteger(areaId) || areaId < 1 || !AREA_DOMAINS.includes(domain))) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        let integrationConfig;
        if (hasAreaId) {
            const area = await OperationalArea.findOne({ where: { id: areaId, wineryId, isActive: true } });
            if (!area) return res.status(404).json({ error: 'Webhook not found' });
            integrationConfig = await OperationalAreaIntegrationConfig.findOne({ where: { wineryId, areaId } });
        } else {
            integrationConfig = await WineryIntegrationConfig.findOne({ where: { wineryId } });
        }
        const connections = parseJsonObject(integrationConfig?.providerConnections);
        const connection = parseJsonObject(connections[domain]);

        if (!connection.webhookSecretHash || !connection.webhookSigningConfigured) {
            logger.warn('Integration webhook signing is not configured', { wineryId, domain });
            return res.status(403).json({ error: 'Webhook signing not configured' });
        }

        const secret = getSingleHeader(req.headers, 'x-vinagent-webhook-secret');
        if (!secret) {
            logger.warn('Missing integration webhook secret header', { wineryId, domain });
            return res.status(403).json({ error: 'Missing webhook secret' });
        }

        if (!timingSafeStringEqual(digestWebhookSecret(secret), connection.webhookSecretHash)) {
            logger.warn('Invalid integration webhook secret', { wineryId, domain });
            return res.status(403).json({ error: 'Invalid webhook secret' });
        }

        const signature = getSingleHeader(req.headers, 'x-vinagent-webhook-signature');
        if (!signature) {
            logger.warn('Missing integration webhook signature header', { wineryId, domain });
            return res.status(403).json({ error: 'Missing signature' });
        }

        const payload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
        if (!validateHmacSignature({ secret, signature, payload })) {
            logger.warn('Invalid integration webhook signature', { wineryId, domain });
            return res.status(403).json({ error: 'Invalid signature' });
        }

        req.integrationWebhook = {
            wineryId,
            domain,
            areaId,
            providerConnection: connection
        };

        return next();
    } catch (err) {
        logger.error('Error validating integration webhook signature', err);
        return res.status(500).json({ error: 'Validation error' });
    }
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
    validateIntegrationWebhookSignature,
    constructWebhookUrl
};
