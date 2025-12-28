const { TaskAction, Task } = require('../models');
const logger = require('../config/logger');

/**
 * Service to handle Audit Logging (TaskAction).
 * Centralizes the creation of audit records and standardized detailed payloads.
 */

/**
 * Records a Task Action (Audit Entry).
 * @param {Object} options
 * @param {Object} [options.transaction] - Sequelize transaction
 * @param {number} options.taskId - ID of the task
 * @param {number} [options.userId] - ID of the actor (User)
 * @param {string} options.actionType - Enum value for the action
 * @param {Object} [options.details] - JSON detail of the action (diffs, snapshots, etc.)
 * @returns {Promise<TaskAction>}
 */
async function logTaskAction({ transaction, taskId, userId, actionType, details }) {
    try {
        const action = await TaskAction.create({
            taskId,
            userId: userId || null, // System actions might have no user
            actionType,
            details: details || {}
        }, { transaction });

        logger.info('Audit Logged', {
            metric: 'audit_event',
            taskId,
            actionType,
            userId,
            actionId: action.id
        });

        return action;
    } catch (err) {
        // We log error but generally we might NOT want to fail the whole transaction 
        // if auditing fails, strictly speaking, but for "Audit Trail" requirements 
        // usually strictness is preferred. Use your judgment or project settings.
        // For VinAgent, we'll propagate the error to ensure data integrity (Audit is required).
        logger.error('Failed to record audit action', { taskId, actionType, error: err.message });
        throw err;
    }
}

/**
 * Helper to compute diff between old and new state.
 * @param {Object} oldState 
 * @param {Object} newState 
 * @returns {Object} diff object { field: { old: val, new: val } }
 */
function computeDiff(oldState, newState) {
    const diff = {};
    const allKeys = new Set([...Object.keys(oldState || {}), ...Object.keys(newState || {})]);

    for (const key of allKeys) {
        const oldVal = oldState[key];
        const newVal = newState[key];
        // Simple strict equality check. 
        // For objects/arrays, this might need deep check, but for now strict equals on top level fields.
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            diff[key] = { from: oldVal, to: newVal };
        }
    }
    return diff;
}

module.exports = {
    logTaskAction,
    computeDiff
};
