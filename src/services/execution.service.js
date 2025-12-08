const { Member, TaskAction } = require('../models');
const logger = require('../config/logger');

/**
 * Executes the side-effects of an approved task.
 * @param {Object} task - The task instance (Sequelize model)
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
async function executeTask(task, transaction) {
    if (task.type === 'ADDRESS_CHANGE') {
        await _executeAddressChange(task, transaction);
    } else {
        logger.info('No automatic execution logic for task type', { type: task.type, taskId: task.id });
    }
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

module.exports = {
    executeTask
};
