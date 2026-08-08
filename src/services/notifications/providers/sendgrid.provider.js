const axios = require('axios');
const logger = require('../../../config/logger');
const { getAxiosOutboundPolicy } = require('../../../utils/outboundHttpPolicy');

class SendgridProvider {
    constructor() {
        this.apiKey = process.env.SENDGRID_API_KEY || null;
        this.enabled = Boolean(this.apiKey);

        if (this.enabled) {
            logger.info('SendGrid Provider Initialized');
        } else if (process.env.NODE_ENV === 'production') {
            logger.error('SendGrid credentials missing. Email delivery is disabled.');
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
            if (process.env.NODE_ENV === 'production') {
                const error = new Error('SendGrid email is not configured. Missing: SENDGRID_API_KEY');
                error.code = 'SENDGRID_NOT_CONFIGURED';
                logger.error('Blocked email send because SendGrid is not configured.');
                throw error;
            }
            logger.info('Mock email delivery accepted', {
                toCount: this.parseRecipients(to).length,
                ccCount: this.parseRecipients(cc).length,
                hasFrom: Boolean(from),
                subjectLength: String(subject || '').length,
                bodyLength: String(text || '').length
            });
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
                    ...getAxiosOutboundPolicy(),
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
            logger.error('SendGrid send failed', {
                code: error.code || null,
                status: error.response?.status || null,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new SendgridProvider();
