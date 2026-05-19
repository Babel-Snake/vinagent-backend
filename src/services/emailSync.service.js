const { EmailSyncState, Message, Member, Winery, WineryIntegrationConfig, WinerySettings, sequelize } = require('../models');
const customerIdentityService = require('./customerIdentity.service');
const emailProviderFactory = require('./integrations/email');
const logger = require('../config/logger');
const taskService = require('./taskService');
const triageService = require('./triage.service');
const { redact, scrubPII } = require('../utils/sanitizer');

function positiveIntegerFromEnv(name, fallback) {
    const parsed = Number.parseInt(process.env[name], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const config = {
    enabled: process.env.EMAIL_SYNC_ENABLED === 'true',
    intervalMs: positiveIntegerFromEnv('EMAIL_SYNC_INTERVAL_MS', 5 * 60 * 1000),
    maxMessages: positiveIntegerFromEnv('EMAIL_SYNC_MAX_MESSAGES', 25),
    initialLookbackHours: positiveIntegerFromEnv('EMAIL_SYNC_INITIAL_LOOKBACK_HOURS', 24)
};

function parseJsonObject(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

function resolveMailboxAddress(integrationConfig) {
    const providerConnections = parseJsonObject(integrationConfig?.providerConnections);
    const emailConnection = parseJsonObject(providerConnections.email);
    return emailConnection.externalAccountId || integrationConfig?.emailFromAddress || null;
}

function resolveFolderId(integrationConfig) {
    const providerConnections = parseJsonObject(integrationConfig?.providerConnections);
    const emailConnection = parseJsonObject(providerConnections.email);
    return emailConnection.externalLocationId || 'inbox';
}

function initialSyncSinceDate() {
    return new Date(Date.now() - (config.initialLookbackHours * 60 * 60 * 1000));
}

async function resolveEmailIdentity({ wineryId, requesterEmail, transaction }) {
    const settings = await WinerySettings.findOne({ where: { wineryId }, transaction });
    const identityConfig = customerIdentityService.getIdentityMatchingConfig(settings);
    return customerIdentityService.resolveExternalIdentity({
        wineryId,
        category: null,
        taskOrigin: 'EXTERNAL',
        inboundMethod: 'email',
        requesterEmail,
        identityConfig,
        transaction,
        allowAutoCreate: false
    });
}

async function ingestEmailMessage({ winery, message, provider, transaction }) {
    const existing = await Message.findOne({
        where: {
            source: 'email',
            externalId: message.externalId
        },
        transaction
    });

    if (existing) {
        return { duplicate: true, message: existing, task: null };
    }

    const fromEmail = message.from?.email || '';
    const body = message.body || message.bodyPreview || '';
    const identityResolution = await resolveEmailIdentity({
        wineryId: winery.id,
        requesterEmail: fromEmail,
        transaction
    });
    const member = identityResolution.memberId
        ? (identityResolution.matchedMember || await Member.findOne({
            where: { id: identityResolution.memberId, wineryId: winery.id },
            transaction
        }))
        : null;

    const storedMessage = await Message.create({
        source: 'email',
        direction: 'inbound',
        subject: scrubPII(message.subject || ''),
        body: scrubPII(body),
        rawPayload: redact({
            provider,
            messageId: message.id,
            internetMessageId: message.internetMessageId,
            conversationId: message.conversationId,
            webLink: message.webLink,
            from: message.from,
            to: message.to,
            cc: message.cc,
            receivedAt: message.receivedAt,
            raw: message.raw
        }),
        externalId: message.externalId,
        receivedAt: message.receivedAt ? new Date(message.receivedAt) : new Date(),
        wineryId: winery.id,
        memberId: member ? member.id : null
    }, { transaction });

    const triageResult = await triageService.triageMessage(
        { body: body || message.subject || '', source: 'email' },
        { winery, member, suggestedChannel: 'email' }
    );

    const task = await taskService.createTask({
        wineryId: winery.id,
        userId: null,
        source: 'system',
        transaction,
        data: {
            ...triageResult,
            memberId: member ? member.id : null,
            messageId: storedMessage.id,
            taskOrigin: 'EXTERNAL',
            inboundMethod: 'email',
            requesterName: message.from?.name || null,
            requesterEmail: fromEmail || null,
            identityResolution,
            suggestedChannel: triageResult.suggestedChannel || 'email',
            suggestedRecipientEmail: fromEmail || triageResult.suggestedRecipientEmail,
            steps: triageResult.suggestedSteps || []
        }
    });

    return { duplicate: false, message: storedMessage, task };
}

async function syncWineryEmail({ wineryId, limit = config.maxMessages } = {}) {
    const integrationConfig = await WineryIntegrationConfig.findOne({ where: { wineryId } });
    if (!integrationConfig) {
        const err = new Error('Integration config not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (integrationConfig.emailProvider !== 'outlook') {
        const err = new Error(`Email sync is only implemented for Outlook/Microsoft 365. Current provider is '${integrationConfig.emailProvider || 'unknown'}'.`);
        err.statusCode = 400;
        err.code = 'EMAIL_PROVIDER_UNSUPPORTED';
        throw err;
    }

    const mailboxAddress = resolveMailboxAddress(integrationConfig);
    if (!mailboxAddress) {
        const err = new Error('Outlook mailbox address is required. Set the email connection Account ID or From Email Address.');
        err.statusCode = 400;
        err.code = 'MAILBOX_NOT_CONFIGURED';
        throw err;
    }

    const folderId = resolveFolderId(integrationConfig);
    const winery = await Winery.findByPk(wineryId);
    if (!winery) {
        const err = new Error('Winery not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    const [state] = await EmailSyncState.findOrCreate({
        where: {
            wineryId,
            provider: 'outlook',
            mailboxAddress,
            folderId
        },
        defaults: {
            lastMessageReceivedAt: null,
            syncStats: {}
        }
    });

    const provider = emailProviderFactory.getProvider(integrationConfig);
    const since = state.lastMessageReceivedAt || initialSyncSinceDate();
    const result = await provider.listInboxMessages({
        since,
        limit,
        folderId
    });
    const messages = (result.messages || [])
        .filter((message) => message.from?.email)
        .sort((a, b) => new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0));

    let imported = 0;
    let duplicates = 0;
    let createdTasks = 0;
    let newestReceivedAt = state.lastMessageReceivedAt ? new Date(state.lastMessageReceivedAt) : null;

    for (const message of messages) {
        const t = await sequelize.transaction();
        try {
            const ingestResult = await ingestEmailMessage({
                winery,
                message,
                provider: 'outlook',
                transaction: t
            });
            await t.commit();

            if (ingestResult.duplicate) {
                duplicates += 1;
            } else {
                imported += 1;
                if (ingestResult.task) createdTasks += 1;
            }

            const receivedAt = message.receivedAt ? new Date(message.receivedAt) : null;
            if (receivedAt && (!newestReceivedAt || receivedAt > newestReceivedAt)) {
                newestReceivedAt = receivedAt;
            }
        } catch (err) {
            if (!t.finished) await t.rollback();
            await state.update({
                lastSyncedAt: new Date(),
                lastError: err.message
            });
            throw err;
        }
    }

    const syncStats = {
        provider: 'outlook',
        mailboxAddress,
        folderId,
        fetched: messages.length,
        imported,
        duplicates,
        createdTasks,
        syncedAt: new Date().toISOString()
    };

    await state.update({
        lastSyncedAt: new Date(),
        lastMessageReceivedAt: newestReceivedAt,
        lastError: null,
        syncStats
    });

    return {
        ...syncStats,
        lastMessageReceivedAt: newestReceivedAt ? newestReceivedAt.toISOString() : null
    };
}

async function syncConfiguredOutlookMailboxes({ limit = config.maxMessages } = {}) {
    const configs = await WineryIntegrationConfig.findAll({
        where: { emailProvider: 'outlook' }
    });
    const results = [];

    for (const integrationConfig of configs) {
        try {
            results.push(await syncWineryEmail({
                wineryId: integrationConfig.wineryId,
                limit
            }));
        } catch (err) {
            logger.warn('Email sync failed for winery', {
                wineryId: integrationConfig.wineryId,
                error: err.message
            });
            results.push({
                wineryId: integrationConfig.wineryId,
                error: err.message
            });
        }
    }

    return results;
}

function startEmailSyncScheduler(options = {}) {
    if (!(options.enabled ?? config.enabled)) {
        logger.info('Email sync scheduler disabled.');
        return null;
    }

    const intervalMs = options.intervalMs || config.intervalMs;
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            await syncConfiguredOutlookMailboxes({ limit: options.limit || config.maxMessages });
        } catch (err) {
            logger.error('Email sync scheduler failed', { error: err.message });
        } finally {
            running = false;
        }
    };

    run();
    const interval = setInterval(run, intervalMs);
    if (interval.unref) interval.unref();
    logger.info('Email sync scheduler started.', { intervalMs });
    return interval;
}

module.exports = {
    config,
    syncWineryEmail,
    syncConfiguredOutlookMailboxes,
    startEmailSyncScheduler
};
