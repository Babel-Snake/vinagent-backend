const twilio = require('twilio');
const logger = require('../../../config/logger');

class TwilioProvider {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (this.accountSid && this.authToken && this.fromNumber) {
            this.client = twilio(this.accountSid, this.authToken);
            this.enabled = true;
            logger.info('Twilio Provider Initialized');
        } else {
            this.enabled = false;
            logger.warn('Twilio Credentials missing. Using Mock Mode.');
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
