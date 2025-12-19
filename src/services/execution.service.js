const { Member, TaskAction } = require('../models');
const logger = require('../config/logger');

/**
 * Executes the side-effects of an approved task.
 * @param {Object} task - The task instance (Sequelize model)
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
async function executeTask(task, transaction, settings) {
    if (!settings) {
        // Fetch if not provided
        const { WinerySettings } = require('../models');
        settings = await WinerySettings.findOne({ where: { wineryId: task.wineryId }, transaction });
    }

    if (!settings || !settings.enableSecureLinks) {
        logger.info(`Skipping automated execution for task ${task.id}: Secure Links disabled.`);
        return;
    }

    // --- LAYER 3: PRE-FLIGHT VALIDATION ---
    // Check subType OR legacy type for backward compatibility
    if (task.subType === 'ACCOUNT_ADDRESS_CHANGE' || task.type === 'ADDRESS_CHANGE') {
        _validateAddressPayload(task); // Throws on failure
        await _executeAddressChange(task, transaction);
    } else if (task.subType === 'BOOKING_NEW') {
        _validateBookingPayload(task); // Throws on failure
        await _executeBooking(task, transaction, settings);
    } else {
        logger.info('No automatic execution logic for task', { type: task.subType || task.type, taskId: task.id });
    }

    // Generic Notification Logic
    // If task is APPROVED/EXECUTED and has a suggested reply, send it.
    if (task.suggestedReplyBody && task.suggestedChannel && task.suggestedChannel !== 'none') {
        const member = await Member.findByPk(task.memberId, { transaction });
        if (member) {
            const contact = task.suggestedChannel === 'email' ? member.email : member.phone;
            if (contact) {
                try {
                    // Send notification (outside transaction? or ensure service handles it safely?)
                    // NotificationService usually makes external calls, so we shouldn't block the DB transaction.
                    // But we want to log the outbound message in the DB.
                    // For now, we'll await it here. If it fails, do we rollback the task approval?
                    // Ideally: No. Notification failure shouldn't stop the business action.
                    // We catch and log error.
                    await _sendNotification(task, member, contact, transaction);
                } catch (notifyErr) {
                    logger.error('Failed to send notification', notifyErr);
                }
            } else {
                logger.warn(`No contact details for ${task.suggestedChannel} on member ${member.id}`);
            }
        }
    }
}

// --- LAYER 3: PRE-FLIGHT VALIDATION HELPERS ---
function _validateAddressPayload(task) {
    const errors = [];
    if (!task.memberId) errors.push('Member ID is required');
    if (!task.payload) errors.push('Payload is required');

    const p = task.payload || {};
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

async function _sendNotification(task, member, contact, transaction) {
    const notificationService = require('./notifications/notification.service');
    await notificationService.send({
        to: contact,
        body: task.suggestedReplyBody,
        channel: task.suggestedChannel
    }, {
        wineryId: task.wineryId,
        memberId: member.id,
        taskId: task.id
    });
}

async function _executeAddressChange(task, transaction) {
    if (!task.memberId || !task.payload) {
        logger.warn('Cannot execute ADDRESS_CHANGE: missing memberId or payload', { taskId: task.id });
        return;
    }

    const { addressLine1, addressLine2, suburb, state, postcode, country } = task.payload;

    // Find Member
    const member = await Member.findByPk(task.memberId, { transaction });
    if (!member) {
        throw new Error(`Member not found for task ${task.id}`);
    }

    // Update fields if present in payload
    if (addressLine1 !== undefined) member.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) member.addressLine2 = addressLine2;
    if (suburb !== undefined) member.suburb = suburb;
    if (state !== undefined) member.state = state;
    if (postcode !== undefined) member.postcode = postcode;
    if (country !== undefined) member.country = country;

    await member.save({ transaction });

    // Update Task status to EXECUTED if purely automated? 
    // Or do we leave it APPROVED? 
    // Requirement usually is: Approved -> (logic) -> Executed.
    // Let's update task status too.
    task.status = 'EXECUTED';
    await task.save({ transaction });

    // Log execution action
    await TaskAction.create({
        taskId: task.id,
        userId: task.updatedBy, // The approver
        actionType: 'EXECUTED',
        details: { changes: 'Member address updated' }
    }, { transaction });

    logger.info('Executed ADDRESS_CHANGE', { taskId: task.id, memberId: member.id });
}

async function _executeBooking(task, transaction) {
    if (!task.payload || !task.payload.date || !task.payload.time || !task.payload.pax) {
        logger.warn('Skipping BOOKING execution: Missing details in payload (date/time/pax)', { taskId: task.id });
        return;
    }

    const { Member } = require('../models');
    const member = await Member.findByPk(task.memberId, { transaction });
    if (!member) throw new Error('Member not found for booking');

    // Load Provider
    const bookingFactory = require('./integrations/booking');
    const provider = await bookingFactory.getProvider(task.wineryId);

    // Make Reservation
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

        // Update Task with Success Info
        task.status = 'EXECUTED';
        task.payload = { ...task.payload, bookingReference: result.referenceCode, bookingStatus: result.status };

        // Append Reference to Reply if it exists
        if (task.suggestedReplyBody) {
            task.suggestedReplyBody += ` (Ref: ${result.referenceCode})`;
        }

        await task.save({ transaction });

        // Log Action
        await TaskAction.create({
            taskId: task.id,
            userId: task.updatedBy,
            actionType: 'EXECUTED',
            details: {
                action: 'BOOKING_CREATED',
                provider: result.provider,
                reference: result.referenceCode
            }
        }, { transaction });

    } catch (bookingError) {
        logger.error('Booking Provider Failed', bookingError);
        // Note: We do NOT throw here if we want to allow the "Approval" to succeed 
        // even if the automation fails (maybe manual follow-up needed).
        // OR we throw and rollback the approval?
        // Let's throw for now so the user knows it failed.
        throw new Error(`Booking Failed: ${bookingError.message}`);
    }
}

module.exports = {
    executeTask
};
