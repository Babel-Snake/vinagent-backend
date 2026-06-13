const twilio = require('twilio');
const logger = require('../../../config/logger');

class TwilioProvider {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        this.missingCredentials = [
            ['TWILIO_ACCOUNT_SID', this.accountSid],
            ['TWILIO_AUTH_TOKEN', this.authToken],
            ['TWILIO_PHONE_NUMBER', this.fromNumber]
        ]
            .filter(([, value]) => !value)
            .map(([key]) => key);

        if (this.missingCredentials.length === 0) {
            this.client = twilio(this.accountSid, this.authToken);
            this.enabled = true;
            logger.info('Twilio Provider Initialized');
        } else {
            this.enabled = false;
            const details = { missingCredentials: this.missingCredentials };
            if (process.env.NODE_ENV === 'production') {
                logger.error('Twilio credentials missing. SMS delivery is disabled.', details);
            } else {
                logger.warn('Twilio credentials missing. Using Mock Mode.', details);
            }
        }
    }

    /**
     * Sends an SMS.
     * @param {string} to - Recipient phone number (E.164)
     * @param {string} body - Message body
     * @returns {Promise<Object>} - Provider response
     */
    async sendSms(to, body, options = {}) {
        const fromNumber = options.from || this.fromNumber;

        if (!this.enabled) {
            if (process.env.NODE_ENV === 'production') {
                const error = new Error(`Twilio SMS is not configured. Missing: ${this.missingCredentials.join(', ')}`);
                error.code = 'TWILIO_NOT_CONFIGURED';
                logger.error('Blocked SMS send because Twilio is not configured.', {
                    to,
                    missingCredentials: this.missingCredentials
                });
                throw error;
            }
            logger.info(`[MOCK SMS] To: ${to} | From: ${fromNumber || 'default'} | Body: ${body}`);
            return { sid: 'mock-sid-' + Date.now(), status: 'queued', provider: 'twilio' };
        }

        try {
            const message = await this.client.messages.create({
                body,
                from: fromNumber,
                to
            });
            logger.info(`Twilio SMS sent: ${message.sid}`);
            return message;
        } catch (error) {
            logger.error('Twilio Send Failed', error);
            throw error;
        }
    }
}

module.exports = new TwilioProvider();
