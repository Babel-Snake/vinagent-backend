const { Message, Winery, Member, WinerySettings, sequelize } = require('../models');
const triageService = require('../services/triage.service');
const taskService = require('../services/taskService');
const customerIdentityService = require('../services/customerIdentity.service');
const integrationEventService = require('../services/integrationEvent.service');
const retellAdapter = require('../services/integrations/inbound/providers/retell');
const retellWebhookContextService = require('../services/retellWebhookContext.service');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');
const { redact, scrubPII } = require('../utils/sanitizer');
const telemetry = require('../services/telemetry');
const { configuredWineryId } = require('../services/deploymentWinery.service');
const { safeRecordUsageEvent } = require('../services/usageTracking.service');
const { METRICS } = require('../services/usageMetricCatalog');

const INTEGRATION_EVENT_TYPES = new Set([
    'call.intake',
    'notice.imported',
    'task.suggested',
    'message.imported',
    'file.imported',
    'unknown.received'
]);

async function resolveWineryByContact(contact, transaction) {
    const deploymentWineryId = configuredWineryId();
    return Winery.findOne({
        where: {
            ...contact,
            ...(deploymentWineryId ? { id: deploymentWineryId } : {})
        },
        transaction
    });
}

function findExistingInboundMessage({ wineryId, source, externalId, transaction }) {
    return Message.findOne({
        where: { wineryId, source, externalId },
        ...(transaction ? { transaction } : {})
    });
}

function isUniqueConstraintError(error) {
    return error?.name === 'SequelizeUniqueConstraintError';
}

async function isCommittedWebhookDuplicate({ error, wineryId, source, externalId }) {
    if (!wineryId || !externalId || !isUniqueConstraintError(error)) return false;

    const existing = await findExistingInboundMessage({ wineryId, source, externalId });
    return Boolean(existing);
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
            configuredProvider: context.providerConnection?.provider || null,
            areaId: context.areaId || null
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
        receivedAt: pickString(payload.receivedAt, payload.timestamp, payload.createdAt),
        suggestedAreaId: context.areaId || null,
        areaConfidence: context.areaId ? 1 : null,
        areaMappingSource: context.areaId ? 'RULE' : null
    };
}

async function handleSms(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    let wineryId = null;
    let externalId = null;
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, Body, MessageSid } = payload;
        externalId = MessageSid;

        logger.info('Received SMS webhook', { messageSid: MessageSid });

        // Resolve the tenant before checking idempotency so provider IDs cannot
        // collide across wineries.
        const winery = await resolveWineryByContact({ contactPhone: To }, t);

        if (!winery) {
            await t.rollback();
            telemetry.recordDroppedMessage('sms', 'UNKNOWN_DESTINATION');
            throw new AppError('Unknown destination phone number', 400, 'UNKNOWN_DESTINATION');
        }
        wineryId = winery.id;

        const existing = await findExistingInboundMessage({
            wineryId,
            source: 'sms',
            externalId: MessageSid,
            transaction: t
        });

        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('sms', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageSid: MessageSid });
            return res.json({ success: true, taskId: null, duplicate: true });
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

        await safeRecordUsageEvent({
            wineryId: winery.id,
            metricKey: METRICS.MESSAGE_RECEIVED,
            quantity: 1,
            occurredAt: message.createdAt || new Date(),
            sourceType: 'message',
            sourceId: message.id,
            idempotencyKey: `message:${message.id}:received`,
            dimensions: { channel: 'sms', provider: 'twilio' },
            transaction: t
        });

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
        if (await isCommittedWebhookDuplicate({ error: err, wineryId, source: 'sms', externalId })) {
            telemetry.recordIngestion('sms', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageSid: externalId });
            return res.json({ success: true, taskId: null, duplicate: true });
        }
        telemetry.recordIngestion('sms', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        return next(err);
    }
}
async function handleEmail(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    let wineryId = null;
    let externalId = null;
    try {
        const payload = req.validatedBody || req.body;
        const { from, to, subject, text, messageId } = payload;
        externalId = messageId;

        logger.info('Received Email webhook', { messageId });

        const winery = await resolveWineryByContact({ contactEmail: to }, t);

        if (!winery) {
            logger.warn('Winery not found for incoming email');
            await t.rollback();
            telemetry.recordDroppedMessage('email', 'UNKNOWN_DESTINATION');
            throw new AppError('Unknown destination email address', 400, 'UNKNOWN_DESTINATION');
        }
        wineryId = winery.id;

        const existing = await findExistingInboundMessage({
            wineryId,
            source: 'email',
            externalId: messageId,
            transaction: t
        });
        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('email', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageId });
            return res.json({ success: true, taskId: null, duplicate: true });
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

        await safeRecordUsageEvent({
            wineryId: winery.id,
            metricKey: METRICS.MESSAGE_RECEIVED,
            quantity: 1,
            occurredAt: message.createdAt || new Date(),
            sourceType: 'message',
            sourceId: message.id,
            idempotencyKey: `message:${message.id}:received`,
            dimensions: { channel: 'email', provider: 'webhook' },
            transaction: t
        });

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
        if (await isCommittedWebhookDuplicate({ error: err, wineryId, source: 'email', externalId })) {
            telemetry.recordIngestion('email', telemetry.STATUS.DUPLICATE, Date.now() - start, { messageId: externalId });
            return res.json({ success: true, taskId: null, duplicate: true });
        }
        telemetry.recordIngestion('email', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        return next(err);
    }
}

async function handleVoice(req, res, next) {
    const start = Date.now();
    const t = await sequelize.transaction();
    let wineryId = null;
    let externalId = null;
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, CallSid, RecordingUrl, TranscriptionText } = payload;
        const transcript = TranscriptionText || '';
        externalId = CallSid;

        logger.info('Received Voice webhook', { callSid: CallSid });

        const winery = await resolveWineryByContact({ contactPhone: To }, t);

        if (!winery) {
            await t.rollback();
            telemetry.recordDroppedMessage('voice', 'UNKNOWN_DESTINATION');
            throw new AppError('Unknown destination phone number', 400, 'UNKNOWN_DESTINATION');
        }
        wineryId = winery.id;

        const existing = await findExistingInboundMessage({
            wineryId,
            source: 'voice',
            externalId: CallSid,
            transaction: t
        });
        if (existing) {
            await t.rollback();
            telemetry.recordIngestion('voice', telemetry.STATUS.DUPLICATE, Date.now() - start, { callSid: CallSid });
            return res.json({ success: true, taskId: null, duplicate: true });
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

        await safeRecordUsageEvent({
            wineryId: winery.id,
            metricKey: METRICS.MESSAGE_RECEIVED,
            quantity: 1,
            occurredAt: message.createdAt || new Date(),
            sourceType: 'message',
            sourceId: message.id,
            idempotencyKey: `message:${message.id}:received`,
            dimensions: { channel: 'voice', provider: 'twilio' },
            transaction: t
        });

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
        if (await isCommittedWebhookDuplicate({ error: err, wineryId, source: 'voice', externalId })) {
            telemetry.recordIngestion('voice', telemetry.STATUS.DUPLICATE, Date.now() - start, { callSid: externalId });
            return res.json({ success: true, taskId: null, duplicate: true });
        }
        telemetry.recordIngestion('voice', telemetry.STATUS.FAILURE, Date.now() - start, { error: err.message });
        return next(err);
    }
}

async function handleIntegrationEvent(req, res, next) {
    const start = Date.now();
    try {
        const context = req.integrationWebhook;
        const data = normalizeIntegrationWebhookPayload(req.body, context);
        if (!data.externalEventId) {
            throw new AppError(
                'A stable externalEventId is required for webhook replay protection.',
                400,
                'EXTERNAL_EVENT_ID_REQUIRED'
            );
        }
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
        const adapted = retellAdapter.buildRetellIntegrationEvent(req.body);

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

        const context = await retellWebhookContextService.resolveRetellWebhookContext(req.body);
        adapted.wineryId = context.wineryId;

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
