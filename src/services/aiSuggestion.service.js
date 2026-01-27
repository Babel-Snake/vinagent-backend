const { Task, Member } = require('../models');
const logger = require('../config/logger');

/**
 * Async AI Generation Trigger
 * Fetches context and calls AI Service to draft a reply.
 * Updates task with suggestedReplyBody.
 */
async function generateAiSuggestion(taskId, wineryId) {
    logger.info('[AI SUGGESTION] Starting generation', { taskId, wineryId });

    try {
        const AiService = require('./ai');
        const task = await Task.findOne({
            where: { id: taskId, wineryId },
            include: [{ model: Member }]
        });

        if (!task) {
            logger.warn('[AI SUGGESTION] Task not found', { taskId, wineryId });
            return;
        }

        // Skip if already has a valid reply
        if (task.suggestedReplyBody && task.suggestedReplyBody.length > 5) {
            logger.info('[AI SUGGESTION] Task already has reply, skipping', { taskId });
            return;
        }

        // Build context for AI
        const context = {
            wineryId,
            member: task.Member,
            suggestedChannel: task.suggestedChannel || 'email'
        };

        // Extract the original text from various possible locations
        const originalText = task.payload?.originalText
            || task.payload?.note
            || task.payload?.summary
            || task.notes
            || `${task.category} - ${task.subType}`;

        const prompt = `Task Category: ${task.category}\nTask Type: ${task.subType}\nRequest: "${originalText}"`;

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

            // Generate subject for email channel
            if ((task.suggestedChannel === 'email' || context.suggestedChannel === 'email') && !task.suggestedReplySubject) {
                task.suggestedReplySubject = aiResult.suggestedTitle
                    || `Re: ${task.subType?.replace(/_/g, ' ') || task.category}`;
            }

            await task.save();
            logger.info('[AI SUGGESTION] Successfully saved reply to task', { taskId, hasSubject: !!task.suggestedReplySubject });
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
            const task = await Task.findByPk(taskId);
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
