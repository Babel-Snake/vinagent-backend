const OutlookGraphEmailProvider = require('./providers/outlookGraph');

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

function buildEmailProviderConfig(integrationConfig) {
    const providerConnections = parseJsonObject(integrationConfig?.providerConnections);
    const emailConnection = parseJsonObject(providerConnections.email);

    return {
        ...emailConnection,
        provider: integrationConfig?.emailProvider || emailConnection.provider || 'sendgrid',
        mailboxAddress: emailConnection.externalAccountId || integrationConfig?.emailFromAddress || null,
        emailFromAddress: integrationConfig?.emailFromAddress || null
    };
}

function getProvider(integrationConfig) {
    const config = buildEmailProviderConfig(integrationConfig);

    if (config.provider === 'outlook') {
        return new OutlookGraphEmailProvider(config);
    }

    const err = new Error(`Email provider '${config.provider}' does not support mailbox sync.`);
    err.code = 'EMAIL_PROVIDER_UNSUPPORTED';
    err.statusCode = 400;
    throw err;
}

module.exports = {
    buildEmailProviderConfig,
    getProvider
};
