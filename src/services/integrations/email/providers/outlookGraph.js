const axios = require('axios');
const EmailAdapter = require('../email.adapter');

function encodeUserId(userId) {
    return encodeURIComponent(userId);
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

class OutlookGraphEmailProvider extends EmailAdapter {
    constructor(config = {}) {
        super(config);
        this.tenantId = config.tenantId || process.env.OUTLOOK_GRAPH_TENANT_ID;
        this.clientId = config.clientId || process.env.OUTLOOK_GRAPH_CLIENT_ID;
        this.clientSecret = config.clientSecret || process.env.OUTLOOK_GRAPH_CLIENT_SECRET;
        this.mailboxAddress = config.mailboxAddress || config.externalAccountId || config.emailFromAddress;
        this.graphBaseUrl = config.graphBaseUrl || process.env.OUTLOOK_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';
        this.tokenBaseUrl = config.tokenBaseUrl || process.env.OUTLOOK_GRAPH_TOKEN_BASE_URL || 'https://login.microsoftonline.com';
        this.cachedToken = null;
        this.cachedTokenExpiresAt = 0;
    }

    isAuthenticated() {
        return Boolean(this.tenantId && this.clientId && this.clientSecret && this.mailboxAddress);
    }

    async getAccessToken() {
        if (this.cachedToken && Date.now() < this.cachedTokenExpiresAt - 60_000) {
            return this.cachedToken;
        }

        if (!this.isAuthenticated()) {
            throw new Error('Outlook Graph credentials or mailbox address are missing.');
        }

        const body = new URLSearchParams();
        body.set('client_id', this.clientId);
        body.set('client_secret', this.clientSecret);
        body.set('scope', 'https://graph.microsoft.com/.default');
        body.set('grant_type', 'client_credentials');

        const response = await axios.post(
            `${this.tokenBaseUrl}/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
            body.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        this.cachedToken = response.data.access_token;
        this.cachedTokenExpiresAt = Date.now() + ((response.data.expires_in || 3600) * 1000);
        return this.cachedToken;
    }

    normalizeMessage(message) {
        const bodyContent = message.body?.content || message.bodyPreview || '';
        const body = message.body?.contentType === 'html' ? stripHtml(bodyContent) : String(bodyContent || '');
        const fromAddress = message.from?.emailAddress || message.sender?.emailAddress || {};

        return {
            provider: 'outlook',
            id: message.id,
            internetMessageId: message.internetMessageId || null,
            externalId: `outlook:${this.mailboxAddress}:${message.id}`,
            subject: message.subject || '',
            body,
            bodyPreview: message.bodyPreview || '',
            from: {
                name: fromAddress.name || '',
                email: fromAddress.address || ''
            },
            to: (message.toRecipients || []).map((recipient) => recipient.emailAddress?.address).filter(Boolean),
            cc: (message.ccRecipients || []).map((recipient) => recipient.emailAddress?.address).filter(Boolean),
            receivedAt: message.receivedDateTime || null,
            conversationId: message.conversationId || null,
            webLink: message.webLink || null,
            raw: message
        };
    }

    async listInboxMessages({ since, limit = 25, folderId = 'inbox' } = {}) {
        const token = await this.getAccessToken();
        const params = new URLSearchParams();
        params.set('$top', String(Math.min(Math.max(Number(limit) || 25, 1), 100)));
        params.set('$orderby', 'receivedDateTime asc');
        params.set('$select', [
            'id',
            'internetMessageId',
            'subject',
            'bodyPreview',
            'body',
            'from',
            'sender',
            'toRecipients',
            'ccRecipients',
            'receivedDateTime',
            'conversationId',
            'webLink'
        ].join(','));

        if (since) {
            params.set('$filter', `receivedDateTime ge ${new Date(since).toISOString()}`);
        }

        const url = `${this.graphBaseUrl}/users/${encodeUserId(this.mailboxAddress)}/mailFolders/${encodeURIComponent(folderId)}/messages?${params.toString()}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Prefer: 'outlook.body-content-type="text"'
            }
        });

        return {
            messages: (response.data.value || []).map((message) => this.normalizeMessage(message)),
            nextLink: response.data['@odata.nextLink'] || null
        };
    }

    async sendEmail({ to, from, subject, text, cc = null }) {
        const token = await this.getAccessToken();
        const sender = from || this.mailboxAddress;
        const toRecipients = String(to || '')
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            .map((address) => ({ emailAddress: { address } }));
        const ccRecipients = String(cc || '')
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            .map((address) => ({ emailAddress: { address } }));

        if (toRecipients.length === 0) {
            throw new Error('At least one email recipient is required.');
        }

        const message = {
            subject: subject || 'Update from your winery',
            body: {
                contentType: 'Text',
                content: text || ''
            },
            toRecipients
        };
        if (ccRecipients.length > 0) {
            message.ccRecipients = ccRecipients;
        }

        await axios.post(
            `${this.graphBaseUrl}/users/${encodeUserId(sender)}/sendMail`,
            {
                message,
                saveToSentItems: true
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            id: null,
            status: 'queued',
            provider: 'outlook'
        };
    }
}

module.exports = OutlookGraphEmailProvider;
