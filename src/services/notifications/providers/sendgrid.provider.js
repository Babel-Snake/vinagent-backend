const axios = require('axios');
const logger = require('../../../config/logger');

class SendgridProvider {
    constructor() {
        this.apiKey = process.env.SENDGRID_API_KEY || null;
        this.enabled = Boolean(this.apiKey);

        if (this.enabled) {
            logger.info('SendGrid Provider Initialized');
        } else {
            logger.warn('SendGrid credentials missing. Using Mock Email Mode.');
        }
    }

    parseRecipients(value) {
        return String(value || '')
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            .map((email) => ({ email }));
    }

    async sendEmail({ to, from, subject, text, cc = null }) {
        if (!this.enabled) {
            logger.info(`[MOCK EMAIL] To: ${to} | Cc: ${cc || ''} | From: ${from} | Subject: ${subject} | Body: ${text}`);
            return {
                id: `mock-email-${Date.now()}`,
                status: 'queued',
                provider: 'sendgrid'
            };
        }

        try {
            const personalization = {
                to: this.parseRecipients(to)
            };
            const ccRecipients = this.parseRecipients(cc);
            if (ccRecipients.length > 0) {
                personalization.cc = ccRecipients;
            }

            if (personalization.to.length === 0) {
                throw new Error('At least one email recipient is required.');
            }

            const response = await axios.post(
                'https://api.sendgrid.com/v3/mail/send',
                {
                    personalizations: [personalization],
                    from: { email: from },
                    subject,
                    content: [{ type: 'text/plain', value: text }]
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                id: response.headers['x-message-id'] || null,
                status: response.status === 202 ? 'queued' : 'sent',
                provider: 'sendgrid'
            };
        } catch (error) {
            logger.error('SendGrid Send Failed', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new SendgridProvider();
