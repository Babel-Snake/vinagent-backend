const { Message, Winery, Member, WinerySettings, sequelize } = require('../models');
const triageService = require('../services/triage.service');
const taskService = require('../services/taskService');
const customerIdentityService = require('../services/customerIdentity.service');
const integrationEventService = require('../services/integrationEvent.service');
const retellAdapter = require('../services/integrations/inbound/providers/retell');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');
const { redact, scrubPII } = require('../utils/sanitizer');
const telemetry = require('../services/telemetry');

const INTEGRATION_EVENT_TYPES = new Set([
    'call.intake',
    'notice.imported',
    'task.suggested',
    'message.imported',
    'file.imported',
    'unknown.received'
]);

async function resolveWineryByContact(contact) {
    return Winery.findOne({ where: contact });
}

async function resolveWebhookIdentity({ wineryId, inboundMethod, requesterEmail = null, requesterPhone = null, transaction }) {
    const settings = await WinerySettings.findOne({ where: { wineryId }, transaction });
    const identityConfig = customerIdentityService.getIdentityMatchingConfig(settings);
    return customerIdentityService.resolveExternalIdentity({
        wineryId,
        category: null,
        taskOrigin: 'EXTERNAL',
        inboundMethod,
        requesterEmail,
        requesterPhone,
        identityConfig,
        transaction,
        allowAutoCreate: false
    });
}

function pickString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return null;
}

function pickObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeIntegrationWebhookPayload(body, context) {
    const payload = pickObject(body) || {};
    const provider = pickString(
        payload.provider,
        payload.source,
        context.providerConnection?.provider,
        context.domain
    ) || context.domain;
    const requestedEventType = pickString(payload.eventType, payload.type, payload.event_type);
    const eventType = INTEGRATION_EVENT_TYPES.has(requestedEventType)
        ? requestedEventType
        : 'unknown.received';
    const rawPayload = pickObject(payload.rawPayload) || pickObject(payload.payload) || payload;
    const normalizedPayload = pickObject(payload.normalizedPayload) || undefined;
    const externalEventId = pickString(
        payload.externalEventId,
        payload.external_id,
        payload.eventId,
        payload.id,
        rawPayload.id,
        rawPayload.eventId,
        rawPayload.externalEventId
    );
    const metadata = {
        ...(pickObject(payload.metadata) || {}),
        webhook: {
            domain: context.domain,
            configuredProvider: context.providerConnection?.provider || null
        }
    };

    return {
        provider,
        intakeMethod: 'webhook',
        eventType,
        externalEventId,
        rawPayload,
        normalizedPayload,
        metadata,
        receivedAt: pickString(payload.receivedAt, payload.timestamp, payload.createdAt)
    };
}

async function handleSms(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, Body, MessageSid } = payload;

        logger.info('Received SMS webhook', { from: From, messageSid: MessageSid });

        // 0. Idempotency Check
        const existing = await Message.findOne({
            where: { externalId: MessageSid, source: 'sms' }
        });

        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('sms', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageSid: MessageSid });
            return res.json({ success: true, taskId: null, duplicate: true });
        }

        // 1. Identify Winery
        const winery = await resolveWineryByContact({ contactPhone: To });

        if (!winery) {
            await t.rollback();
            telemetry.recordDroppedMessage('sms', 'UNKNOWN_DESTINATION', JSON.stringify(payload));
            throw new AppError('Unknown destination phone number', 400, 'UNKNOWN_DESTINATION');
        }

        // 2. Resolve Member Identity
        const identityResolution = await resolveWebhookIdentity({
            wineryId: winery.id,
            inboundMethod: 'sms',
            requesterPhone: From,
            transaction: t
        });
        const member = identityResolution.memberId
            ? (identityResolution.matchedMember || await Member.findOne({ where: { id: identityResolution.memberId, wineryId: winery.id }, transaction: t }))
            : null;

        // 3. Create Message (Atomic)
        const sanitizedPayload = redact(payload);
        const sanitizedBody = scrubPII(Body);

        const message = await Message.create({
            source: 'sms',
            direction: 'inbound',
            body: sanitizedBody,
            rawPayload: sanitizedPayload,
            externalId: MessageSid,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        }, { transaction: t });

        // 4. Run Triage
        const triageStart = Date.now();
        const triageResult = await triageService.triageMessage({ body: Body, source: 'sms' }, { winery, member });
        telemetry.recordTriage('sms', triageResult.category, Date.now() - triageStart);

        // 5. Create Task (Atomic)
        const task = await taskService.createTask({
            wineryId: winery.id,
            userId: null,
            source: 'system',
            transaction: t,
            data: {
                ...triageResult,
                memberId: member ? member.id : null,
                messageId: message.id,
                taskOrigin: 'EXTERNAL',
                inboundMethod: 'sms',
                requesterPhone: From,
                identityResolution: identityResolution,
                suggestedChannel: triageResult.suggestedChannel || 'sms',
                steps: triageResult.suggestedSteps || []
            }
        });

        await t.commit();

        telemetry.recordIngestion('sms', telemetry.STATUS.SUCCESS, Date.now() - start, { taskId: task.id });
        logger.info('Created task from SMS', { taskId: task.id, type: task.type });

        res.json({ success: true, taskId: task.id });

    } catch (err) {
        if (!t.finished) await t.rollback();
        telemetry.recordIngestion('sms', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        next(err);
    }
}
async function handleEmail(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    try {
        const payload = req.validatedBody || req.body;
        const { from, to, subject, text, messageId } = payload;

        logger.info('Received Email webhook', { from, messageId });

        // Idempotency
        const existing = await Message.findOne({
            where: { externalId: messageId, source: 'email' }
        });
        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('email', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageId });
            return res.json({ success: true, taskId: null, duplicate: true });
        }

        const winery = await resolveWineryByContact({ contactEmail: to });

        if (!winery) {
            logger.warn('Winery not found for incoming email', { to });
            await t.rollback();
            telemetry.recordDroppedMessage('email', 'UNKNOWN_DESTINATION', JSON.stringify(payload));
            throw new AppError('Unknown destination email address', 400, 'UNKNOWN_DESTINATION');
        }

        const identityResolution = await resolveWebhookIdentity({
            wineryId: winery.id,
            inboundMethod: 'email',
            requesterEmail: from,
            transaction: t
        });
        const member = identityResolution.memberId
            ? (identityResolution.matchedMember || await Member.findOne({ where: { id: identityResolution.memberId, wineryId: winery.id }, transaction: t }))
            : null;

        const sanitizedPayload = redact(payload);
        const sanitizedBody = scrubPII(text);

        const message = await Message.create({
            source: 'email',
            direction: 'inbound',
            subject: scrubPII(subject), // Also scrub subject
            body: sanitizedBody,
            rawPayload: sanitizedPayload,
            externalId: messageId,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        }, { transaction: t });

        const triageStart = Date.now();
        const triageResult = await triageService.triageMessage({ body: text || subject || '', source: 'email' }, { winery, member });
        telemetry.recordTriage('email', triageResult.category, Date.now() - triageStart);

        const task = await taskService.createTask({
            wineryId: winery.id,
            userId: null,
            source: 'system',
            transaction: t,
            data: {
                ...triageResult,
                memberId: member ? member.id : null,
                messageId: message.id,
                taskOrigin: 'EXTERNAL',
                inboundMethod: 'email',
                requesterEmail: from,
                identityResolution: identityResolution,
                suggestedChannel: triageResult.suggestedChannel || 'email',
                steps: triageResult.suggestedSteps || []
            }
        });

        await t.commit();

        telemetry.recordIngestion('email', telemetry.STATUS.SUCCESS, Date.now() - start, { taskId: task.id });
        logger.info('Created task from Email', { taskId: task.id, type: task.type });

        res.json({ success: true, taskId: task.id });
    } catch (err) {
        if (!t.finished) await t.rollback();
        telemetry.recordIngestion('email', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        next(err);
    }
}

async function handleVoice(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, CallSid, RecordingUrl, TranscriptionText } = payload;
        const transcript = TranscriptionText || '';

        logger.info('Received Voice webhook', { from: From, callSid: CallSid });

        // Idempotency
        const existing = await Message.findOne({
            where: { externalId: CallSid, source: 'voice' }
        });
        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('voice', telemetry.STATUS.DUPLICATE, Date.now() - start, { callSid: CallSid });
            return res.json({ success: true, taskId: null, duplicate: true });
        }

        const winery = await resolveWineryByContact({ contactPhone: To });

        if (!winery) {
            await t.rollback();
            telemetry.recordDroppedMessage('voice', 'UNKNOWN_DESTINATION', JSON.stringify(payload));
            throw new AppError('Unknown destination phone number', 400, 'UNKNOWN_DESTINATION');
        }

        const identityResolution = await resolveWebhookIdentity({
            wineryId: winery.id,
            inboundMethod: 'phone',
            requesterPhone: From,
            transaction: t
        });
        const member = identityResolution.memberId
            ? (identityResolution.matchedMember || await Member.findOne({ where: { id: identityResolution.memberId, wineryId: winery.id }, transaction: t }))
            : null;

        const sanitizedPayload = redact(payload);
        const piiTranscript = scrubPII(transcript);
        const messageBody = piiTranscript || (RecordingUrl ? `Voice recording available at ${RecordingUrl}` : '');

        const message = await Message.create({
            source: 'voice',
            direction: 'inbound',
            body: messageBody,
            rawPayload: sanitizedPayload,
            externalId: CallSid,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        }, { transaction: t });

        const triageStart = Date.now();
        const triageResult = await triageService.triageMessage({ body: messageBody, source: 'voice' }, { winery, member });
        telemetry.recordTriage('voice', triageResult.category, Date.now() - triageStart);

        const task = await taskService.createTask({
            wineryId: winery.id,
            userId: null,
            source: 'system',
            transaction: t,
            data: {
                ...triageResult,
                memberId: member ? member.id : null,
                messageId: message.id,
                taskOrigin: 'EXTERNAL',
                inboundMethod: 'phone',
                requesterPhone: From,
                identityResolution: identityResolution,
                suggestedChannel: triageResult.suggestedChannel || 'voice',
                steps: triageResult.suggestedSteps || []
            }
        });

        await t.commit();

        telemetry.recordIngestion('voice', telemetry.STATUS.SUCCESS, Date.now() - start, { taskId: task.id });
        logger.info('Created task from Voice', { taskId: task.id, type: task.type });

        res.json({ success: true, taskId: task.id });
    } catch (err) {
        if (!t.finished) await t.rollback();
        telemetry.recordIngestion('voice', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        next(err);
    }
}

async function handleIntegrationEvent(req, res, next) {
    const start = Date.now();
    try {
        const context = req.integrationWebhook;
        const data = normalizeIntegrationWebhookPayload(req.body, context);
        const result = await integrationEventService.createIntegrationEvent({
            wineryId: context.wineryId,
            userId: null,
            data
        });

        telemetry.recordIngestion('integration_event', result.duplicate ? telemetry.STATUS.DUPLICATE : telemetry.STATUS.SUCCESS, Date.now() - start, {
            domain: context.domain,
            provider: data.provider,
            eventType: data.eventType,
            duplicate: result.duplicate
        });
        logger.info('Created integration event from generic webhook', {
            wineryId: context.wineryId,
            domain: context.domain,
            provider: data.provider,
            eventType: data.eventType,
            eventId: result.event.id,
            duplicate: result.duplicate
        });

        res.status(result.duplicate ? 200 : 201).json({
            success: true,
            ...result
        });
    } catch (err) {
        telemetry.recordIngestion('integration_event', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        next(err);
    }
}

async function handleRetell(req, res, next) {
    const start = Date.now();
    try {
        const adapted = retellAdapter.buildRetellIntegrationEvent(req.body, {
            wineryId: req.params.wineryId || req.query.wineryId
        });

        logger.info('Received Retell webhook', {
            event: adapted.retellEvent,
            externalCallId: adapted.externalCallId,
            shouldStore: adapted.shouldStore
        });

        if (!adapted.shouldStore) {
            telemetry.recordIngestion('retell', telemetry.STATUS.PARTIAL, Date.now() - start, {
                retellEvent: adapted.retellEvent,
                reason: adapted.reason
            });
            return res.json({
                success: true,
                received: true,
                skipped: true,
                reason: adapted.reason
            });
        }

        if (!adapted.wineryId) {
            throw new AppError('Retell webhook could not be mapped to a winery.', 400, 'WINERY_CONTEXT_REQUIRED');
        }

        const result = await integrationEventService.createIntegrationEvent({
            wineryId: adapted.wineryId,
            userId: null,
            data: adapted.event
        });

        telemetry.recordIngestion('retell', result.duplicate ? telemetry.STATUS.DUPLICATE : telemetry.STATUS.SUCCESS, Date.now() - start, {
            wineryId: adapted.wineryId,
            eventType: adapted.event.eventType,
            retellEvent: adapted.retellEvent,
            duplicate: result.duplicate
        });

        return res.status(result.duplicate ? 200 : 201).json({
            success: true,
            received: true,
            ...result
        });
    } catch (err) {
        telemetry.recordIngestion('retell', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        return next(err);
    }
}

module.exports = {
    handleSms,
    handleEmail,
    handleVoice,
    handleIntegrationEvent,
    handleRetell
};
