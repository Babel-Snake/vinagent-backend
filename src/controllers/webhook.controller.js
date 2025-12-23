const { Message, Winery, Task, Member } = require('../models');
const triageService = require('../services/triage.service');
const logger = require('../config/logger');

async function resolveWineryByContact(contact) {
    return Winery.findOne({ where: contact });
}

async function findMemberByContact(wineryId, contactField, value) {
    if (!value) return null;
    return Member.findOne({ where: { wineryId, [contactField]: value } });
}

async function handleSms(req, res, next) {
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, Body, MessageSid } = payload;

        logger.info('Received SMS webhook', { from: From, messageSid: MessageSid });

        // 1. Identify Winery by the 'To' phone number
        // For MVP, if we don't find it, we might hardcode or fail.
        // Let's try to find it.
        const winery = await resolveWineryByContact({ contactPhone: To });

        if (!winery) {
            logger.warn('Winery not found for incoming SMS', { to: To });
            return res.status(400).json({ error: 'Unknown destination phone number' });
        }

        // 2. Identify Member (optional)
        const member = await findMemberByContact(winery.id, 'phone', From);

        // 3. Create Message record
        const message = await Message.create({
            source: 'sms',
            direction: 'inbound',
            body: Body,
            rawPayload: payload,
            externalId: MessageSid,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        });

        // 4. Run Triage
        // Pass context (member, winery) to help triage engine if needed
        const triageResult = await triageService.triageMessage({ body: Body, source: 'sms' }, { winery, member });

        // 5. Create Task
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
        });

        logger.info('Created task from SMS', { taskId: task.id, type: task.type });

        // 6. Respond to Twilio
        // Twilio expects TwiML usually, but for a webhook 200 OK is fine to acknowledge receipt.
        // If we want to reply immediately, we'd send TwiML.
        // For VinAgent async model, we just return JSON success for our own tracking, 
        // or empty TwiML <Response/> to say "no immediate reply".
        // For this API endpoint (internal usage mainly or wrapped), let's return JSON.
        res.json({ success: true, taskId: task.id });

    } catch (err) {
        next(err);
    }
}
async function handleEmail(req, res, next) {
    try {
        const payload = req.validatedBody || req.body;
        const { from, to, subject, text, messageId } = payload;

        logger.info('Received Email webhook', { from, messageId });

        const winery = await resolveWineryByContact({ contactEmail: to });

        if (!winery) {
            logger.warn('Winery not found for incoming email', { to });
            return res.status(400).json({ error: 'Unknown destination email address' });
        }

        const member = await findMemberByContact(winery.id, 'email', from);

        const message = await Message.create({
            source: 'email',
            direction: 'inbound',
            subject,
            body: text,
            rawPayload: payload,
            externalId: messageId,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        });

        const triageResult = await triageService.triageMessage({ body: text || subject || '', source: 'email' }, { winery, member });

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
        });

        logger.info('Created task from Email', { taskId: task.id, type: task.type });

        res.json({ success: true, taskId: task.id });
    } catch (err) {
        next(err);
    }
}

async function handleVoice(req, res, next) {
    try {
        const payload = req.validatedBody || req.body;
        const { From, To, CallSid, RecordingUrl, TranscriptionText } = payload;
        const transcript = TranscriptionText || '';

        logger.info('Received Voice webhook', { from: From, callSid: CallSid });

        const winery = await resolveWineryByContact({ contactPhone: To });

        if (!winery) {
            logger.warn('Winery not found for incoming voice call', { to: To });
            return res.status(400).json({ error: 'Unknown destination phone number' });
        }

        const member = await findMemberByContact(winery.id, 'phone', From);

        const messageBody = transcript || (RecordingUrl ? `Voice recording available at ${RecordingUrl}` : '');

        const message = await Message.create({
            source: 'voice',
            direction: 'inbound',
            body: messageBody,
            rawPayload: payload,
            externalId: CallSid,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        });

        const triageResult = await triageService.triageMessage({ body: messageBody, source: 'voice' }, { winery, member });

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
        });

        logger.info('Created task from Voice', { taskId: task.id, type: task.type });

        res.json({ success: true, taskId: task.id });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    handleSms,
    handleEmail,
    handleVoice
};
