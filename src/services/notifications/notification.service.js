const twilioProvider = require('./providers/twilio.provider');
const sendgridProvider = require('./providers/sendgrid.provider');
const emailProviderFactory = require('../integrations/email');
const { Message, WineryIntegrationConfig } = require('../../models');
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
    async send({ to, body, channel = 'sms', subject = null, from = null, cc = null }, context = {}) {
        logger.info(`Sending notification via ${channel} to ${to}`);

        let providerResult;
        let error = null;
        let providerName = channel === 'sms' ? 'twilio' : 'sendgrid';
        let integrationConfig = context.integrationConfig || null;

        if (!integrationConfig && context.wineryId) {
            integrationConfig = await WineryIntegrationConfig.findOne({
                where: { wineryId: context.wineryId },
                transaction: context.transaction
            });
        }

        const channelsEnabled = Array.isArray(integrationConfig?.channelsEnabled)
            ? integrationConfig.channelsEnabled
            : null;
        if (channelsEnabled && !channelsEnabled.includes(channel)) {
            throw new Error(`Channel '${channel}' is disabled for this winery.`);
        }

        try {
            if (channel === 'sms') {
                providerName = integrationConfig?.smsProvider || 'twilio';
                providerResult = await twilioProvider.sendSms(to, body, {
                    from: from || integrationConfig?.smsFromNumber || null
                });
            } else if (channel === 'email') {
                providerName = integrationConfig?.emailProvider || 'sendgrid';
                const emailFrom = from || integrationConfig?.emailFromAddress || process.env.DEFAULT_FROM_EMAIL || 'noreply@vinagent.local';
                const emailSubject = subject || 'Update from your winery';
                if (providerName === 'outlook') {
                    if (!integrationConfig) {
                        throw new Error('Outlook email requires winery integration configuration.');
                    }
                    const outlookProvider = emailProviderFactory.getProvider(integrationConfig);
                    providerResult = await outlookProvider.sendEmail({
                        to,
                        from: emailFrom,
                        subject: emailSubject,
                        text: body,
                        cc
                    });
                } else {
                    providerResult = await sendgridProvider.sendEmail({
                        to,
                        from: emailFrom,
                        subject: emailSubject,
                        text: body,
                        cc
                    });
                }
            } else {
                throw new Error(`Channel '${channel}' not supported yet.`);
            }

            if (providerResult && typeof providerResult === 'object' && !providerResult.provider) {
                providerResult.provider = providerName;
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
                    subject: channel === 'email' ? (subject || 'Update from your winery') : null,
                    body,
                    rawPayload: {
                        provider: providerName,
                        from: from || integrationConfig?.emailFromAddress || integrationConfig?.smsFromNumber || null,
                        cc: channel === 'email' ? cc : null,
                        result: providerResult || null,
                        error
                    },
                    receivedAt: new Date(),
                    wineryId: context.wineryId,
                    memberId: context.memberId,
                    taskId: context.taskId,
                    externalId: providerResult?.sid || providerResult?.id || null
                }, {
                    transaction: context.transaction
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
