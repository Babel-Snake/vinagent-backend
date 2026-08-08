const { Task, Member, Message, TaskAction, TaskStep, User } = require('../models');
const logger = require('../config/logger');
const { getUserForWinery } = require('./taskTenantScope.service');

function resolveContactForChannel(task, channel) {
    const manualIntake = task.payload?.manualIntake || {};
    const email = task.suggestedRecipientEmail
        || task.Member?.email
        || manualIntake.requesterEmail
        || null;
    const phone = task.Member?.phone
        || manualIntake.requesterPhone
        || null;
    const requiredContact = channel === 'email'
        ? 'email'
        : channel === 'sms' || channel === 'voice'
            ? 'phone'
            : 'none';
    const hasRequiredContact = requiredContact === 'email'
        ? Boolean(email)
        : requiredContact === 'phone'
            ? Boolean(phone)
            : true;

    return {
        email,
        phone,
        requiredContact,
        hasRequiredContact
    };
}

function stripIrrelevantEmailWarning(action, channel, contact) {
    if (!action || !['sms', 'voice'].includes(channel) || !contact.phone) {
        return action;
    }

    return String(action)
        .replace(/Contact details missing\.?\s*Please locate the customer's email before sending the drafted reply\.?/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Async AI Generation Trigger
 * Fetches context and calls AI Service to draft a reply.
 * Updates task with suggestedReplyBody, suggestedAction, and optionally auto-assigns.
 */
async function generateAiSuggestion(taskId, wineryId, options = {}) {
    const { force = false, includeHistory = false } = options;
    logger.info('[AI SUGGESTION] Starting generation', { taskId, wineryId });

    try {
        const AiService = require('./ai');
        const task = await Task.findOne({
            where: { id: taskId, wineryId },
            include: [
                { model: Member, where: { wineryId }, required: false },
                {
                    model: Message,
                    as: 'Messages',
                    where: { wineryId },
                    required: false,
                    separate: true,
                    order: [['receivedAt', 'ASC'], ['id', 'ASC']],
                    limit: 20
                },
                {
                    model: TaskStep,
                    as: 'TaskSteps',
                    required: false,
                    include: [{
                        model: User,
                        as: 'Owner',
                        where: { wineryId },
                        attributes: ['id', 'displayName', 'role'],
                        required: false
                    }]
                }
            ]
        });

        if (!task) {
            logger.warn('[AI SUGGESTION] Task not found', { taskId, wineryId });
            return;
        }

        // Skip if already has a valid reply
        if (!force && task.suggestedReplyBody && task.suggestedReplyBody.length > 5) {
            logger.info('[AI SUGGESTION] Task already has reply, skipping', { taskId });
            return;
        }

        const manualIntake = task.payload?.manualIntake || {};
        const responseChannel = task.suggestedChannel || 'email';
        const responseContact = resolveContactForChannel(task, responseChannel);

        // Build context for AI
        const context = {
            wineryId,
            member: task.Member,
            suggestedChannel: responseChannel,
            manualIntake,
            requesterName: manualIntake.requesterName || null,
            requesterEmail: manualIntake.requesterEmail || null,
            requesterPhone: manualIntake.requesterPhone || null,
            contact: responseContact
        };

        // Extract the original text from various possible locations
        const originalText = task.payload?.originalText
            || task.payload?.note
            || task.payload?.summary
            || task.notes
            || `${task.category} - ${task.subType}`;

        const stepLines = (task.TaskSteps || [])
            .sort((a, b) => {
                if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                return a.id - b.id;
            })
            .map((step, index) => {
                const owner = step.Owner?.displayName || 'Unassigned';
                const dueAt = step.dueAt ? `, due ${new Date(step.dueAt).toISOString()}` : '';
                const blocked = step.blockedReason ? `, blocked: ${step.blockedReason}` : '';
                return `${index + 1}. [${step.status}] ${step.title} (${step.stepType}) owner=${owner}, waitingOn=${step.waitingOn}${dueAt}${blocked}`;
            });

        const workflowBlock = [
            `Workflow State: ${task.workflowState || 'NOT_STARTED'}`,
            `Waiting On: ${task.waitingOn || 'NONE'}`,
            `Next Step: ${task.nextStepSummary || 'None recorded'}`
        ].join('\n');

        const outcomeLines = [];
        if (task.resolvedAs) outcomeLines.push(`Resolved As: ${task.resolvedAs}`);
        if (task.resolutionType) outcomeLines.push(`Resolution Type: ${task.resolutionType}`);
        if (task.customerOutcome) outcomeLines.push(`Customer Outcome: ${task.customerOutcome}`);
        if (task.resolutionSummary) outcomeLines.push(`Resolution Summary: ${task.resolutionSummary}`);
        if (task.followUpRequired) {
            outcomeLines.push(`Follow-up Required: yes${task.followUpDueAt ? `, due ${new Date(task.followUpDueAt).toISOString()}` : ''}`);
            if (task.followUpSummary) {
                outcomeLines.push(`Follow-up Summary: ${task.followUpSummary}`);
            }
        }

        const messageLines = (task.Messages || [])
            .map((message, index) => {
                const timestamp = message.receivedAt || message.createdAt;
                const subject = message.subject ? ` subject="${message.subject}"` : '';
                const body = (message.body || '').replace(/\s+/g, ' ').trim();
                const preview = body.length > 280 ? `${body.slice(0, 277)}...` : body;
                return `${index + 1}. [${message.direction}] ${message.source}${subject} at ${new Date(timestamp).toISOString()} :: ${preview || '[no body]'}`;
            });

        let historyBlock = '';
        if (includeHistory) {
            const actions = await TaskAction.findAll({
                where: { taskId },
                include: [{
                    model: User,
                    where: { wineryId },
                    attributes: ['id', 'displayName', 'role'],
                    required: false
                }],
                order: [['createdAt', 'ASC']],
                limit: 15
            });

            const summarizeDetails = (action) => {
                if (!action.details) return '';
                if (action.actionType === 'NOTE_ADDED' && action.details.note) {
                    return `Note: ${action.details.note}`;
                }
                if (action.details.changes) {
                    const keys = Object.keys(action.details.changes);
                    if (keys.length > 0) return `Changes: ${keys.join(', ')}`;
                }
                if (action.details.parentTaskId || action.details.childTaskId) {
                    return `Linked: parent ${action.details.parentTaskId || 'n/a'}, child ${action.details.childTaskId || 'n/a'}`;
                }
                if (action.details.from !== undefined || action.details.to !== undefined) {
                    return `Assignment: ${action.details.from || 'unassigned'} -> ${action.details.to || 'unassigned'}`;
                }
                const keys = Object.keys(action.details || {});
                return keys.length > 0 ? `Details: ${keys.join(', ')}` : '';
            };

            const historyLines = actions.map((action, idx) => {
                const actor = action.User?.displayName || 'System';
                const details = summarizeDetails(action);
                return `${idx + 1}. ${action.actionType} by ${actor} at ${action.createdAt.toISOString()}${details ? ` | ${details}` : ''}`;
            });

            if (historyLines.length > 0) {
                historyBlock = `\nHistory (oldest to newest):\n${historyLines.join('\n')}`;
            }
        }

        const prompt = `Task Category: ${task.category}\nTask Type: ${task.subType}\nCurrent Status: ${task.status}\n${workflowBlock}${outcomeLines.length > 0 ? `\nRecorded Outcome:\n${outcomeLines.join('\n')}` : ''}\nOriginal Request: "${originalText}"${messageLines.length > 0 ? `\nTask Communication Timeline:\n${messageLines.join('\n')}` : ''}${stepLines.length > 0 ? `\nCurrent Workflow Steps:\n${stepLines.join('\n')}` : ''}${historyBlock}\n\nGenerate the next best customer-facing response given the full context above.`;

        logger.info('[AI SUGGESTION] Calling AI Service', { taskId, prompt: prompt.substring(0, 100) });

        const aiResult = await AiService.classify(prompt.trim(), context);

        logger.info('[AI SUGGESTION] AI Response received', {
            taskId,
            hasResult: !!aiResult,
            hasSuggestedReply: !!aiResult?.suggestedReply,
            keys: aiResult ? Object.keys(aiResult) : []
        });

        // Check if AI returned a valid reply
        if (aiResult && aiResult.suggestedReply) {
            task.suggestedReplyBody = aiResult.suggestedReply;

            // Save internal routing recommendation
            if (aiResult.suggestedAction) {
                task.suggestedAction = stripIrrelevantEmailWarning(
                    aiResult.suggestedAction,
                    responseChannel,
                    responseContact
                );
            }

            // Auto-assign if AI suggested a specific staff member and task is unassigned
            if (aiResult.suggestedAssigneeId && !task.assigneeId) {
                const suggestedAssignee = await getUserForWinery({
                    userId: aiResult.suggestedAssigneeId,
                    wineryId: task.wineryId,
                    attributes: ['id'],
                    notFoundMessage: 'Suggested assignee not found for this winery.'
                });
                task.assigneeId = suggestedAssignee.id;
            }

            // Save suggested recipient and CC
            if (responseChannel === 'email' && aiResult.suggestedRecipientEmail) {
                task.suggestedRecipientEmail = aiResult.suggestedRecipientEmail;
            }
            if (responseChannel === 'email' && aiResult.suggestedCc) {
                task.suggestedCc = aiResult.suggestedCc;
            }
            if (responseChannel !== 'email') {
                task.suggestedRecipientEmail = null;
                task.suggestedCc = null;
                task.suggestedReplySubject = null;
            }

            // Generate subject for email channel
            if ((task.suggestedChannel === 'email' || context.suggestedChannel === 'email') && !task.suggestedReplySubject) {
                task.suggestedReplySubject = aiResult.suggestedTitle
                    || `Re: ${task.subType?.replace(/_/g, ' ') || task.category}`;
            }

            await task.save();
            logger.info('[AI SUGGESTION] Successfully saved reply to task', { taskId, hasSubject: !!task.suggestedReplySubject, hasSuggestedAction: !!task.suggestedAction, assigneeId: task.assigneeId });
        } else {
            // Log error but also set a placeholder so UI knows it failed
            logger.error('[AI SUGGESTION] AI did not return suggestedReply', { taskId, aiResult });
            task.suggestedReplyBody = '[AI Error: No response generated. Please draft manually.]';
            await task.save();
        }

    } catch (err) {
        logger.error('[AI SUGGESTION] Exception during generation', {
            taskId,
            error: err.message,
            stack: err.stack
        });

        // Try to update task with error message so UI shows feedback
        try {
            const task = await Task.findOne({ where: { id: taskId, wineryId } });
            if (task) {
                task.suggestedReplyBody = `[AI Error: ${err.message}]`;
                await task.save();
            }
        } catch (saveErr) {
            logger.error('[AI SUGGESTION] Failed to save error state', { taskId, error: saveErr.message });
        }
    }
}

module.exports = {
    generateAiSuggestion
};
