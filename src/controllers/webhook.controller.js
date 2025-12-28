const { Message, Winery, Task, Member, sequelize } = require('../models');
const triageService = require('../services/triage.service');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');
const { redact, scrubPII } = require('../utils/sanitizer');
const telemetry = require('../services/telemetry');

async function resolveWineryByContact(contact) {
    return Winery.findOne({ where: contact });
}

async function findMemberByContact(wineryId, contactField, value) {
    if (!value) return null;
    return Member.findOne({ where: { wineryId, [contactField]: value } });
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

        // 2. Identify Member
        const member = await findMemberByContact(winery.id, 'phone', From);

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
        const task = await Task.create({
            type: triageResult.type,
            category: triageResult.category,
            subType: triageResult.subType,
            customerType: triageResult.customerType,
            sentiment: triageResult.sentiment,
            status: triageResult.status,
            priority: triageResult.priority,
            payload: triageResult.payload,
            requiresApproval: triageResult.requiresApproval,
            wineryId: winery.id,
            memberId: member ? member.id : null,
            messageId: message.id,
            suggestedChannel: triageResult.suggestedChannel || 'sms',
            suggestedReplyBody: triageResult.suggestedReplyBody,
            suggestedReplySubject: triageResult.suggestedReplySubject
        }, { transaction: t });

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

        const member = await findMemberByContact(winery.id, 'email', from);

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

        const task = await Task.create({
            type: triageResult.type,
            category: triageResult.category,
            subType: triageResult.subType,
            customerType: triageResult.customerType,
            sentiment: triageResult.sentiment,
            status: triageResult.status,
            priority: triageResult.priority,
            payload: triageResult.payload,
            requiresApproval: triageResult.requiresApproval,
            wineryId: winery.id,
            memberId: member ? member.id : null,
            messageId: message.id,
            suggestedChannel: triageResult.suggestedChannel || 'email',
            suggestedReplyBody: triageResult.suggestedReplyBody,
            suggestedReplySubject: triageResult.suggestedReplySubject
        }, { transaction: t });

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

        const member = await findMemberByContact(winery.id, 'phone', From);

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

        const task = await Task.create({
            type: triageResult.type,
            category: triageResult.category,
            subType: triageResult.subType,
            customerType: triageResult.customerType,
            sentiment: triageResult.sentiment,
            status: triageResult.status,
            priority: triageResult.priority,
            payload: triageResult.payload,
            requiresApproval: triageResult.requiresApproval,
            wineryId: winery.id,
            memberId: member ? member.id : null,
            messageId: message.id,
            suggestedChannel: triageResult.suggestedChannel || 'voice',
            suggestedReplyBody: triageResult.suggestedReplyBody,
            suggestedReplySubject: triageResult.suggestedReplySubject
        }, { transaction: t });

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

module.exports = {
    handleSms,
    handleEmail,
    handleVoice,
    handleRetell: async (req, res, next) => {
        logger.info('Received Retell webhook', { event: req.body.event_type });
        // TODO: Implement Retell logic (Message creation -> Triage -> Task)
        res.json({ success: true, received: true });
    }
};
