const { Member, TaskAction, TaskArea } = require('../models');
const memberActionTokenService = require('./memberActionTokenService');
const logger = require('../config/logger');
const { clearTaskOutcomeFields } = require('../utils/taskOutcome');

function _isAddressTask(task) {
    return task.subType === 'ACCOUNT_ADDRESS_CHANGE' || task.type === 'ADDRESS_CHANGE';
}

function _isBookingTask(task) {
    return task.subType === 'BOOKING_NEW';
}

function _isOrderTask(task) {
    return (task.type && task.type.startsWith('ORDER_')) || task.category === 'ORDER';
}

function _cloneTaskPayload(task) {
    if (task.payload && typeof task.payload === 'object') {
        return { ...task.payload };
    }
    return {};
}

function _integrationErrorDetails(taskId, error) {
    return {
        taskId,
        code: error?.code || null,
        status: error?.response?.status || error?.status || null,
        error: error?.message || 'Integration operation failed'
    };
}

async function _getPrimaryAreaId(task, transaction) {
    if (task.areaScope !== 'AREAS') return null;
    const primary = await TaskArea.findOne({
        where: {
            taskId: task.id,
            wineryId: task.wineryId,
            relationshipType: 'PRIMARY'
        },
        attributes: ['areaId'],
        transaction
    });
    return primary?.areaId || null;
}

function _extractAddressPayload(task) {
    if (task.payload && task.payload.newAddress) {
        return task.payload.newAddress;
    }
    return task.payload || {};
}

function _extractRequesterProfile(task, member = null) {
    const manualIntake = task.payload?.manualIntake || {};
    const requesterName = manualIntake.requesterName || null;
    const nameParts = requesterName ? requesterName.trim().split(/\s+/) : [];

    return {
        firstName: member?.firstName || nameParts[0] || 'Unknown',
        lastName: member?.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Customer'),
        email: member?.email || task.suggestedRecipientEmail || manualIntake.requesterEmail || null,
        phone: member?.phone || manualIntake.requesterPhone || null
    };
}

async function _recordExecutionResult(task, transaction, result) {
    const nextResult = {
        occurredAt: new Date().toISOString(),
        ...result
    };
    const payload = _cloneTaskPayload(task);
    const executionResults = Array.isArray(payload.executionResults) ? [...payload.executionResults] : [];

    executionResults.push(nextResult);
    payload.executionResults = executionResults.slice(-25);
    payload.lastExecutionResult = nextResult;
    task.payload = payload;
    task.changed('payload', true);
    await task.save({ transaction });

    await TaskAction.create({
        taskId: task.id,
        userId: task.updatedBy || null,
        actionType: 'EXECUTION_RECORDED',
        details: nextResult
    }, { transaction });

    return nextResult;
}

function _validateAddressPayload(task) {
    const errors = [];
    if (!task.memberId) errors.push('Member ID is required');
    if (!task.payload) errors.push('Payload is required');

    const p = _extractAddressPayload(task);
    if (!p.addressLine1) errors.push('Address Line 1 is required');
    if (!p.suburb) errors.push('Suburb is required');
    if (!p.postcode) errors.push('Postcode is required');

    if (errors.length > 0) {
        const err = new Error(`ADDRESS_CHANGE validation failed: ${errors.join(', ')}`);
        err.statusCode = 400;
        err.code = 'EXECUTION_VALIDATION_FAILED';
        throw err;
    }
}

function _validateBookingPayload(task) {
    const errors = [];
    if (!task.payload) errors.push('Payload is required');

    const p = task.payload || {};
    if (!p.date) errors.push('Booking date is required');
    if (!p.time) errors.push('Booking time is required');
    if (!p.pax) errors.push('Party size (pax) is required');

    if (errors.length > 0) {
        const err = new Error(`BOOKING validation failed: ${errors.join(', ')}`);
        err.statusCode = 400;
        err.code = 'EXECUTION_VALIDATION_FAILED';
        throw err;
    }
}

function _validateOrderPayload(task) {
    if (!task.payload) return;
}

function _buildOrderNote(task) {
    const orderId = task.payload?.orderId || 'unknown-order';
    return [
        `VinAgent order workflow update`,
        `Task ID: ${task.id}`,
        `Task Type: ${task.subType || task.type || task.category}`,
        `Order ID: ${orderId}`,
        task.suggestedAction ? `Suggested Action: ${task.suggestedAction}` : null,
        task.resolutionSummary ? `Resolution Summary: ${task.resolutionSummary}` : null
    ].filter(Boolean).join('\n');
}

function _resolveNotificationTarget(task, member) {
    const manualIntake = task.payload?.manualIntake || {};
    const channel = task.suggestedChannel;

    if (channel === 'email') {
        return {
            to: task.suggestedRecipientEmail || member?.email || manualIntake.requesterEmail || null,
            subject: task.suggestedReplySubject || `Update: ${task.subType || task.category || 'Task'}`,
            cc: task.suggestedCc || null
        };
    }

    if (channel === 'sms') {
        return {
            to: member?.phone || manualIntake.requesterPhone || null,
            subject: null
        };
    }

    return { to: null, subject: null };
}

async function _sendNotification(task, member, transaction) {
    const notificationService = require('./notifications/notification.service');
    const target = _resolveNotificationTarget(task, member);

    if (!target.to) {
        await _recordExecutionResult(task, transaction, {
            kind: 'notification',
            operation: 'send',
            provider: task.suggestedChannel || 'unknown',
            status: 'SKIPPED',
            channel: task.suggestedChannel || 'unknown',
            summary: 'Notification skipped because no destination contact was available.'
        });
        return;
    }

    try {
        const providerResult = await notificationService.send({
            to: target.to,
            body: task.suggestedReplyBody,
            channel: task.suggestedChannel,
            subject: target.subject,
            cc: target.cc || null
        }, {
            wineryId: task.wineryId,
            memberId: member?.id || task.memberId || null,
            taskId: task.id,
            transaction
        });

        await _recordExecutionResult(task, transaction, {
            kind: 'notification',
            operation: 'send',
            provider: providerResult?.provider || task.suggestedChannel,
            status: providerResult?.status || 'SENT',
            channel: task.suggestedChannel,
            target: target.to,
            subject: target.subject,
            cc: target.cc || null,
            externalId: providerResult?.sid || providerResult?.id || null,
            summary: `Sent ${task.suggestedChannel} notification to ${target.to}.`
        });
    } catch (notifyErr) {
        await _recordExecutionResult(task, transaction, {
            kind: 'notification',
            operation: 'send',
            provider: task.suggestedChannel,
            status: 'FAILED',
            channel: task.suggestedChannel,
            target: target.to,
            subject: target.subject,
            cc: target.cc || null,
            summary: `Notification delivery failed (${notifyErr.code || 'DELIVERY_FAILED'}).`
        });
        throw notifyErr;
    }
}

async function _executeAddressChange(task, transaction) {
    const member = await Member.findOne({
        where: { id: task.memberId, wineryId: task.wineryId },
        transaction
    });
    if (!member) {
        throw new Error(`Member not found for task ${task.id}`);
    }

    const addressPayload = _extractAddressPayload(task);
    const channel = task.suggestedChannel || 'sms';
    const target = channel === 'email' ? member.email : member.phone;
    if (!target) {
        throw new Error(`No contact details for ${channel} on member ${member.id}`);
    }

    const tokenRecord = await memberActionTokenService.createToken({
        memberId: member.id,
        wineryId: task.wineryId,
        taskId: task.id,
        type: 'ADDRESS_CHANGE',
        channel,
        target,
        payload: { newAddress: addressPayload },
        transaction
    });

    const confirmationUrl = memberActionTokenService.getConfirmationUrl(tokenRecord.rawToken);
    const baseBody = task.suggestedReplyBody || 'Hi, please confirm your address update using this secure link:';
    const replyBody = baseBody.includes('http')
        ? baseBody
        : `${baseBody} ${confirmationUrl}`;

    task.status = 'PENDING';
    task.workflowState = 'WAITING';
    task.waitingOn = 'CUSTOMER';
    task.nextStepSummary = 'Await member confirmation';
    task.blockedReason = null;
    clearTaskOutcomeFields(task);
    task.suggestedReplyBody = replyBody;
    await task.save({ transaction });

    await TaskAction.create({
        taskId: task.id,
        userId: task.updatedBy,
        actionType: 'EXECUTION_TRIGGERED',
        details: { tokenId: tokenRecord.id, channel }
    }, { transaction });

    await _recordExecutionResult(task, transaction, {
        kind: 'address_change',
        operation: 'secure_link_created',
        provider: 'secure_link',
        status: 'PENDING_CUSTOMER',
        channel,
        tokenId: tokenRecord.id,
        target,
        summary: 'Address confirmation link created and awaiting member action.'
    });

    logger.info('Execution triggered for ADDRESS_CHANGE', {
        taskId: task.id,
        memberId: member.id,
        tokenId: tokenRecord.id
    });

    return member;
}

async function _executeBooking(task, transaction) {
    const member = await Member.findOne({
        where: { id: task.memberId, wineryId: task.wineryId },
        transaction
    });
    if (!member) throw new Error('Member not found for booking');

    const bookingFactory = require('./integrations/booking');
    const areaId = await _getPrimaryAreaId(task, transaction);
    const provider = await bookingFactory.getProvider(task.wineryId, { areaId, transaction });

    try {
        const result = await provider.createReservation({
            ...task.payload,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            phone: member.phone,
            memberId: member.id
        });

        logger.info(`Booking created via ${result.provider}`, { reference: result.referenceCode });

        task.status = 'ACTIONED';
        task.payload = {
            ..._cloneTaskPayload(task),
            bookingReference: result.referenceCode,
            bookingStatus: result.status,
            bookingProvider: result.provider
        };

        if (task.suggestedReplyBody) {
            task.suggestedReplyBody += ` (Ref: ${result.referenceCode})`;
        }

        await task.save({ transaction });

        await TaskAction.create({
            taskId: task.id,
            userId: task.updatedBy,
            actionType: 'ACTIONED',
            details: {
                action: 'BOOKING_CREATED',
                provider: result.provider,
                reference: result.referenceCode
            }
        }, { transaction });

        await _recordExecutionResult(task, transaction, {
            kind: 'booking',
            operation: 'create_reservation',
            provider: result.provider || 'unknown',
            status: result.status || 'RECORDED',
            referenceCode: result.referenceCode || null,
            externalId: result.referenceCode || null,
            summary: `Booking created with provider ${result.provider || 'unknown'}.`
        });
    } catch (bookingError) {
        await _recordExecutionResult(task, transaction, {
            kind: 'booking',
            operation: 'create_reservation',
            provider: 'unknown',
            status: 'FAILED',
            summary: bookingError.message
        });
        logger.error('Booking provider failed', _integrationErrorDetails(task.id, bookingError));
        throw new Error(`Booking Failed: ${bookingError.message}`);
    }

    return member;
}

async function _executeOrderUpdate(task, transaction) {
    const crmFactory = require('./integrations/crm');
    const member = task.memberId ? await Member.findOne({
        where: { id: task.memberId, wineryId: task.wineryId },
        transaction
    }) : null;
    const customerProfile = _extractRequesterProfile(task, member);

    if (!customerProfile.email && !customerProfile.phone) {
        await _recordExecutionResult(task, transaction, {
            kind: 'order',
            operation: 'crm_writeback',
            provider: 'unavailable',
            status: 'SKIPPED',
            summary: 'Order writeback skipped because no customer email or phone was available.'
        });
        return member;
    }

    const areaId = await _getPrimaryAreaId(task, transaction);
    const provider = await crmFactory.getProvider(task.wineryId, { areaId, transaction });

    try {
        const externalMember = member?.externalRef
            ? { id: member.externalRef, created: false }
            : await provider.upsertMember(customerProfile);

        if (member && externalMember?.id && member.externalRef !== externalMember.id) {
            member.externalRef = externalMember.id;
            await member.save({ transaction });
        }

        await provider.addNote(externalMember.id, _buildOrderNote(task));
        const orderResult = await provider.recordOrderEvent(externalMember.id, {
            taskId: task.id,
            orderId: task.payload?.orderId || null,
            subType: task.subType || task.type || 'ORDER',
            payload: task.payload || {}
        });

        task.status = 'ACTIONED';
        task.payload = {
            ..._cloneTaskPayload(task),
            orderWriteback: {
                provider: orderResult.provider,
                crmMemberId: externalMember.id,
                referenceCode: orderResult.referenceCode,
                status: orderResult.status,
                recordedAt: orderResult.recordedAt,
                createdCustomer: Boolean(externalMember.created)
            }
        };
        await task.save({ transaction });

        await TaskAction.create({
            taskId: task.id,
            userId: task.updatedBy,
            actionType: 'ACTIONED',
            details: {
                action: 'ORDER_WRITEBACK',
                provider: orderResult.provider,
                reference: orderResult.referenceCode,
                crmMemberId: externalMember.id
            }
        }, { transaction });

        await _recordExecutionResult(task, transaction, {
            kind: 'order',
            operation: 'crm_writeback',
            provider: orderResult.provider || 'unknown',
            status: orderResult.status || 'RECORDED',
            referenceCode: orderResult.referenceCode || null,
            externalId: externalMember.id,
            orderId: task.payload?.orderId || null,
            summary: `Order event recorded against external customer ${externalMember.id}.`
        });
    } catch (orderError) {
        await _recordExecutionResult(task, transaction, {
            kind: 'order',
            operation: 'crm_writeback',
            provider: 'unknown',
            status: 'FAILED',
            orderId: task.payload?.orderId || null,
            summary: orderError.message
        });
        logger.error('Order writeback failed', _integrationErrorDetails(task.id, orderError));
        throw new Error(`Order Writeback Failed: ${orderError.message}`);
    }

    return member;
}

async function executeTask(task, transaction, settings) {
    if (!settings) {
        const { WinerySettings } = require('../models');
        settings = await WinerySettings.findOne({ where: { wineryId: task.wineryId }, transaction });
    }

    let member = task.memberId ? await Member.findOne({
        where: { id: task.memberId, wineryId: task.wineryId },
        transaction
    }) : null;

    let completedExternalAction = false;

    if (_isAddressTask(task)) {
        if (!settings || !settings.enableSecureLinks) {
            logger.info(`Skipping secure-link execution for task ${task.id}: Secure Links disabled.`);
            await _recordExecutionResult(task, transaction, {
                kind: 'address_change',
                operation: 'secure_link_created',
                provider: 'secure_link',
                status: 'SKIPPED',
                summary: 'Secure link execution skipped because secure links are disabled.'
            });
        } else {
            _validateAddressPayload(task);
            member = await _executeAddressChange(task, transaction);
        }
    } else if (_isBookingTask(task)) {
        if (settings && settings.enableBookingModule === false) {
            await _recordExecutionResult(task, transaction, {
                kind: 'booking',
                operation: 'create_reservation',
                provider: settings.bookingProvider || 'mock',
                status: 'SKIPPED',
                summary: 'Booking execution skipped because the booking module is disabled.'
            });
        } else {
            _validateBookingPayload(task);
            member = await _executeBooking(task, transaction);
            completedExternalAction = true;
        }
    } else if (_isOrderTask(task)) {
        if (settings && settings.enableOrdersModule === false) {
            await _recordExecutionResult(task, transaction, {
                kind: 'order',
                operation: 'crm_writeback',
                provider: settings.crmProvider || 'mock',
                status: 'SKIPPED',
                orderId: task.payload?.orderId || null,
                summary: 'Order execution skipped because the orders module is disabled.'
            });
        } else {
            _validateOrderPayload(task);
            member = await _executeOrderUpdate(task, transaction);
            completedExternalAction = true;
        }
    } else {
        logger.info('No automatic execution logic for task', { type: task.subType || task.type, taskId: task.id });
    }

    if (task.suggestedReplyBody && task.suggestedChannel && !['none', 'voice'].includes(task.suggestedChannel)) {
        try {
            await _sendNotification(task, member, transaction);
        } catch (notifyErr) {
            logger.error('Failed to send notification', _integrationErrorDetails(task.id, notifyErr));
            // Do not roll back a booking/CRM action that has already succeeded in an
            // external system. Notification-only and secure-link workflows remain
            // atomic: if delivery fails, the task cannot be marked as actioned.
            if (!completedExternalAction) throw notifyErr;
        }
    }
}

module.exports = {
    executeTask
};
