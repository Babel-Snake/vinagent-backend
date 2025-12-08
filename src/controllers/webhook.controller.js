const { Message, Winery, Task, Member } = require('../models');
const triageService = require('../services/triage.service');
const logger = require('../config/logger');

async function handleSms(req, res, next) {
    try {
        const { From, To, Body, MessageSid } = req.body;

        logger.info('Received SMS webhook', { from: From, messageSid: MessageSid });

        // 1. Identify Winery by the 'To' phone number
        // For MVP, if we don't find it, we might hardcode or fail.
        // Let's try to find it.
        const winery = await Winery.findOne({ where: { contactPhone: To } });

        if (!winery) {
            logger.warn('Winery not found for incoming SMS', { to: To });
            return res.status(400).json({ error: 'Unknown destination phone number' });
        }

        // 2. Identify Member (optional)
        const member = await Member.findOne({
            where: {
                wineryId: winery.id,
                phone: From
            }
        });

        // 3. Create Message record
        const message = await Message.create({
            source: 'sms',
            direction: 'inbound',
            body: Body,
            rawPayload: req.body,
            externalId: MessageSid,
            receivedAt: new Date(),
            wineryId: winery.id,
            memberId: member ? member.id : null
        });

        // 4. Run Triage
        // Pass context (member, winery) to help triage engine if needed
        const triageResult = await triageService.triageMessage({ body: Body }, { winery, member });

        // 5. Create Task
        const task = await Task.create({
            type: triageResult.type,
            status: triageResult.status,
            priority: triageResult.priority,
            payload: triageResult.payload,
            requiresApproval: triageResult.requiresApproval,
            wineryId: winery.id,
            memberId: member ? member.id : null,
            messageId: message.id,
            // Default suggested channel back to SMS since it came from SMS
            suggestedChannel: 'sms'
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

module.exports = {
    handleSms
};
