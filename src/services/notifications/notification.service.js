const twilioProvider = require('./providers/twilio.provider');
const { Message } = require('../../models');
const logger = require('../../config/logger');

class NotificationService {
    /**
     * Sends a notification to a user/member.
     * @param {Object} params
     * @param {string} params.to - Phone number or Email
     * @param {string} params.body - The message content
     * @param {string} params.channel - 'sms', 'email' (default: sms)
     * @param {Object} [context] - { wineryId, memberId, taskId, userId } for logging
     */
    async send({ to, body, channel = 'sms' }, context = {}) {
        logger.info(`Sending notification via ${channel} to ${to}`);

        let providerResult;
        let error = null;

        try {
            if (channel === 'sms') {
                providerResult = await twilioProvider.sendSms(to, body);
            } else {
                throw new Error(`Channel '${channel}' not supported yet.`);
            }
        } catch (err) {
            error = err.message;
            logger.error('Notification Service Error', err);
            // We might still want to log the attempt failure below
        }

        // Log to DB (Outbound Message)
        try {
            if (context.wineryId) {
                await Message.create({
                    direction: 'outbound',
                    source: channel,
                    body,
                    rawPayload: providerResult || { error },
                    wineryId: context.wineryId,
                    memberId: context.memberId,
                    // externalId: providerResult?.sid // If message model updated
                });
            }
        } catch (dbErr) {
            logger.error('Failed to log outbound message to DB', dbErr);
        }

        if (error) throw new Error(error);
        return providerResult;
    }
}

module.exports = new NotificationService();
