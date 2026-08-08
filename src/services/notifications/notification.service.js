const twilioProvider = require('./providers/twilio.provider');
const sendgridProvider = require('./providers/sendgrid.provider');
const emailProviderFactory = require('../integrations/email');
const { Message, WineryIntegrationConfig } = require('../../models');
const logger = require('../../config/logger');
const { safeRecordUsageEvent } = require('../usageTracking.service');
const { METRICS } = require('../usageMetricCatalog');

function summarizeProviderResult(result, providerName) {
    if (!result || typeof result !== 'object') return null;
    return {
        provider: result.provider || providerName,
        id: result.sid || result.id || null,
        status: result.status || null
    };
}

function unsupportedProviderError(channel, providerName) {
    const error = new Error(`Provider '${providerName}' is not supported for ${channel} delivery.`);
    error.code = 'INTEGRATION_PROVIDER_UNSUPPORTED';
    return error;
}

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
        logger.info('Sending notification', {
            channel,
            wineryId: context.wineryId || null,
            taskId: context.taskId || null,
            hasRecipient: Boolean(to)
        });

        let providerResult;
        let deliveryError = null;
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
                if (providerName !== 'twilio') {
                    throw unsupportedProviderError(channel, providerName);
                }
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
                } else if (providerName === 'sendgrid') {
                    providerResult = await sendgridProvider.sendEmail({
                        to,
                        from: emailFrom,
                        subject: emailSubject,
                        text: body,
                        cc
                    });
                } else {
                    throw unsupportedProviderError(channel, providerName);
                }
            } else {
                throw new Error(`Channel '${channel}' not supported yet.`);
            }

            if (providerResult && typeof providerResult === 'object' && !providerResult.provider) {
                providerResult.provider = providerName;
            }
        } catch (err) {
            deliveryError = err;
            logger.error('Notification delivery failed', {
                channel,
                provider: providerName,
                code: err.code || null,
                error: err.message
            });
            // We might still want to log the attempt failure below
        }

        // Log to DB (Outbound Message)
        try {
            if (context.wineryId) {
                const storedMessage = await Message.create({
                    direction: 'outbound',
                    source: channel,
                    subject: channel === 'email' ? (subject || 'Update from your winery') : null,
                    body,
                    rawPayload: {
                        provider: providerName,
                        from: from || integrationConfig?.emailFromAddress || integrationConfig?.smsFromNumber || null,
                        cc: channel === 'email' ? cc : null,
                        result: summarizeProviderResult(providerResult, providerName),
                        error: deliveryError
                            ? { code: deliveryError.code || 'DELIVERY_FAILED' }
                            : null
                    },
                    receivedAt: new Date(),
                    wineryId: context.wineryId,
                    memberId: context.memberId,
                    taskId: context.taskId,
                    externalId: providerResult?.sid || providerResult?.id || null
                }, {
                    transaction: context.transaction
                });
                await safeRecordUsageEvent({
                    wineryId: context.wineryId,
                    actorUserId: context.userId || null,
                    metricKey: METRICS.MESSAGE_SENT,
                    quantity: 1,
                    occurredAt: storedMessage.createdAt || new Date(),
                    sourceType: 'message',
                    sourceId: storedMessage.id,
                    idempotencyKey: `message:${storedMessage.id}:sent`,
                    dimensions: {
                        channel,
                        provider: providerName,
                        result: deliveryError ? 'failed' : 'success'
                    },
                    transaction: context.transaction
                });
            }
        } catch (dbErr) {
            logger.error('Failed to log outbound message to DB', {
                code: dbErr.code || null,
                error: dbErr.message
            });
        }

        if (deliveryError) throw deliveryError;
        return providerResult;
    }
}

module.exports = new NotificationService();
