'use client';

import { useState } from 'react';
import {
    IntegrationConnection,
    syncEmailInbox,
    testIntegrationConnection,
    updateIntegrationConfig,
    Winery,
    WineryIntegrationConfig
} from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { operationalLabel } from '../../lib/operationalPresentation';

type IntegrationDomain = 'sms' | 'email' | 'pos' | 'crm' | 'booking' | 'delivery';

type IntegrationForm = {
    smsProvider: string;
    smsFromNumber: string;
    emailProvider: string;
    emailFromAddress: string;
    channelsEnabled: string[];
    kioskModeEnabled: boolean;
    posProvider: string;
    crmProvider: string;
    bookingProvider: string;
    deliveryProvider: string;
    providerConnections: Record<IntegrationDomain, IntegrationConnection>;
};

const DOMAIN_LABELS: Record<IntegrationDomain, string> = {
    sms: 'SMS',
    email: 'Email',
    pos: 'Point of Sale',
    crm: 'CRM / Wine Club',
    booking: 'Booking',
    delivery: 'Delivery'
};

const PROVIDER_FIELDS: Record<IntegrationDomain, keyof IntegrationForm> = {
    sms: 'smsProvider',
    email: 'emailProvider',
    pos: 'posProvider',
    crm: 'crmProvider',
    booking: 'bookingProvider',
    delivery: 'deliveryProvider'
};

const PROVIDER_OPTIONS: Record<IntegrationDomain, { value: string; label: string }[]> = {
    sms: [
        { value: 'twilio', label: 'Twilio' },
        { value: 'messagemedia', label: 'MessageMedia' },
        { value: 'other', label: 'Other / Custom' }
    ],
    email: [
        { value: 'outlook', label: 'Outlook / Microsoft 365' },
        { value: 'sendgrid', label: 'SendGrid' },
        { value: 'mailgun', label: 'Mailgun' },
        { value: 'ses', label: 'AWS SES' },
        { value: 'other', label: 'Other / Custom' }
    ],
    pos: [
        { value: 'square', label: 'Square' },
        { value: 'shopify', label: 'Shopify' },
        { value: 'vend', label: 'Vend' },
        { value: 'lightspeed', label: 'Lightspeed' },
        { value: 'other', label: 'Other / Custom' }
    ],
    crm: [
        { value: 'commerce7', label: 'Commerce7' },
        { value: 'winedirect', label: 'WineDirect' },
        { value: 'ecellar', label: 'eCellar' },
        { value: 'other', label: 'Other / Custom' }
    ],
    booking: [
        { value: 'sevenrooms', label: 'SevenRooms' },
        { value: 'resy', label: 'Resy' },
        { value: 'opentable', label: 'OpenTable' },
        { value: 'nowbookit', label: 'Now Book It' },
        { value: 'other', label: 'Other / Custom' }
    ],
    delivery: [
        { value: 'auspost', label: 'Australia Post' },
        { value: 'shippit', label: 'Shippit' },
        { value: 'startrack', label: 'StarTrack' },
        { value: 'other', label: 'Other / Custom' }
    ]
};

const DEFAULT_CAPABILITIES: Record<IntegrationDomain, string[]> = {
    sms: ['send_outbound', 'receive_webhook', 'log_message'],
    email: ['send_outbound', 'read_inbox', 'receive_webhook', 'log_message'],
    pos: ['read_orders', 'read_products'],
    crm: ['read_customers', 'write_customer_notes', 'record_order_event', 'sync_external_ids'],
    booking: ['check_availability', 'create_reservation', 'record_booking_reference'],
    delivery: ['track_shipments', 'create_tracking_follow_up']
};

const DEFAULT_WEBHOOKS: Record<IntegrationDomain, string> = {
    sms: '/api/webhooks/sms',
    email: '/api/webhooks/email',
    pos: '/api/webhooks/integration/{wineryId}/pos',
    crm: '/api/webhooks/integration/{wineryId}/crm',
    booking: '/api/webhooks/integration/{wineryId}/booking',
    delivery: '/api/webhooks/integration/{wineryId}/delivery'
};

const DOMAINS: IntegrationDomain[] = ['sms', 'email', 'crm', 'booking', 'pos', 'delivery'];
const CHANNELS = ['sms', 'email'];

function webhookPath(domain: IntegrationDomain, wineryId?: number) {
    return DEFAULT_WEBHOOKS[domain].replace('{wineryId}', String(wineryId || '{wineryId}'));
}

function defaultConnection(domain: IntegrationDomain, provider: string, wineryId?: number): IntegrationConnection {
    return {
        provider,
        status: 'not_connected',
        authMethod: provider === 'other' ? 'manual' : 'api_key',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: webhookPath(domain, wineryId),
        webhookSigningConfigured: false,
        webhookSecret: '',
        clearWebhookSecret: false,
        capabilities: DEFAULT_CAPABILITIES[domain],
        lastTestedAt: null,
        lastError: null,
        notes: ''
    };
}

function normalizeConnections(config: Partial<WineryIntegrationConfig>, baseProviders: Record<IntegrationDomain, string>, wineryId?: number) {
    const stored = config.providerConnections || {};

    return DOMAINS.reduce((connections, domain) => {
        connections[domain] = {
            ...defaultConnection(domain, baseProviders[domain], wineryId),
            ...(stored[domain] || {}),
            provider: baseProviders[domain],
            webhookUrl: stored[domain]?.webhookUrl || webhookPath(domain, wineryId),
            webhookSecret: '',
            clearWebhookSecret: false
        };
        return connections;
    }, {} as Record<IntegrationDomain, IntegrationConnection>);
}

function statusClass(status?: string) {
    if (status === 'connected') return 'border-green-200 bg-green-50 text-green-700';
    if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
    if (status === 'needs_reauth') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-gray-200 bg-gray-50 text-gray-600';
}

function capabilitiesToText(capabilities?: string[]) {
    return Array.isArray(capabilities) ? capabilities.join(', ') : '';
}

function capabilitiesFromText(value: string) {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function IntegrationsTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const config: Partial<WineryIntegrationConfig> = winery.integrationConfig || {};
    const baseProviders = {
        sms: config.smsProvider || 'twilio',
        email: config.emailProvider || 'sendgrid',
        pos: config.posProvider || 'other',
        crm: config.crmProvider || 'other',
        booking: config.bookingProvider || 'other',
        delivery: config.deliveryProvider || 'other'
    };
    const [formData, setFormData] = useState<IntegrationForm>({
        smsProvider: baseProviders.sms,
        smsFromNumber: config.smsFromNumber || '',
        emailProvider: baseProviders.email,
        emailFromAddress: config.emailFromAddress || '',
        channelsEnabled: Array.isArray(config.channelsEnabled) ? config.channelsEnabled : CHANNELS,
        kioskModeEnabled: config.kioskModeEnabled || false,
        posProvider: baseProviders.pos,
        crmProvider: baseProviders.crm,
        bookingProvider: baseProviders.booking,
        deliveryProvider: baseProviders.delivery,
        providerConnections: normalizeConnections(config, baseProviders, winery.id)
    });
    const [saving, setSaving] = useState(false);
    const [testingDomain, setTestingDomain] = useState<IntegrationDomain | null>(null);
    const [syncingEmail, setSyncingEmail] = useState(false);
    const [emailSyncSummary, setEmailSyncSummary] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    function updateConnection(domain: IntegrationDomain, updates: Partial<IntegrationConnection>) {
        setFormData((current) => ({
            ...current,
            providerConnections: {
                ...current.providerConnections,
                [domain]: {
                    ...current.providerConnections[domain],
                    ...updates
                }
            }
        }));
    }

    function updateProvider(domain: IntegrationDomain, provider: string) {
        const providerField = PROVIDER_FIELDS[domain];
        setFormData((current) => ({
            ...current,
            [providerField]: provider,
            providerConnections: {
                ...current.providerConnections,
                [domain]: {
                    ...current.providerConnections[domain],
                    provider,
                    authMethod: provider === 'other' ? 'manual' : current.providerConnections[domain].authMethod || 'api_key'
                }
            }
        }));
    }

    function toggleChannel(channel: string) {
        setFormData((current) => {
            const nextChannels = current.channelsEnabled.includes(channel)
                ? current.channelsEnabled.filter((entry) => entry !== channel)
                : [...current.channelsEnabled, channel];
            return { ...current, channelsEnabled: nextChannels };
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setFeedback(null);
        setSaving(true);
        try {
            await updateIntegrationConfig(formData);
            setFormData((current) => ({
                ...current,
                providerConnections: DOMAINS.reduce((connections, domain) => {
                    const connection = current.providerConnections[domain];
                    connections[domain] = {
                        ...connection,
                        webhookSigningConfigured: connection.clearWebhookSecret
                            ? false
                            : Boolean(connection.webhookSecret || connection.webhookSigningConfigured),
                        webhookSecret: '',
                        clearWebhookSecret: false
                    };
                    return connections;
                }, {} as Record<IntegrationDomain, IntegrationConnection>)
            }));
            setFeedback({ tone: 'success', message: 'Winery integration settings saved.' });
            onUpdate();
        } catch (error) {
            setFeedback({ tone: 'error', message: errorMessage(error, 'Failed to save integrations') });
        } finally {
            setSaving(false);
        }
    }

    async function handleTest(domain: IntegrationDomain) {
        setTestingDomain(domain);
        try {
            const result = await testIntegrationConnection(domain);
            updateConnection(domain, result);
        } catch {
            updateConnection(domain, {
                status: 'error',
                lastTestedAt: new Date().toISOString(),
                lastError: 'Connection test failed.'
            });
        } finally {
            setTestingDomain(null);
        }
    }

    async function handleSyncEmail() {
        setSyncingEmail(true);
        setEmailSyncSummary(null);
        try {
            const result = await syncEmailInbox(25);
            setEmailSyncSummary(`Inbox synced: ${result.imported} imported, ${result.duplicates} duplicates, ${result.createdTasks} tasks created.`);
            onUpdate();
        } catch (err: unknown) {
            setEmailSyncSummary(errorMessage(err, 'Email sync failed.'));
        } finally {
            setSyncingEmail(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {feedback && <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</p>}
            <section className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Communication Channels</h3>
                    <div className="flex flex-wrap gap-3">
                        {CHANNELS.map((channel) => (
                            <label key={channel} className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={formData.channelsEnabled.includes(channel)}
                                    onChange={() => toggleChannel(channel)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                                />
                                {channel.toUpperCase()}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-600">SMS Sender</label>
                        <input
                            type="text"
                            value={formData.smsFromNumber}
                            onChange={(e) => setFormData({ ...formData, smsFromNumber: e.target.value })}
                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                            placeholder="+614..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-600">Email From Address</label>
                        <input
                            type="email"
                            value={formData.emailFromAddress}
                            onChange={(e) => setFormData({ ...formData, emailFromAddress: e.target.value })}
                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                            placeholder="hello@winery.com"
                        />
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-4">
                    <h3 className="text-lg font-semibold text-gray-900">Provider Connections</h3>
                </div>

                <div className="divide-y divide-gray-200">
                    {DOMAINS.map((domain) => {
                        const connection = formData.providerConnections[domain];
                        const providerField = PROVIDER_FIELDS[domain];
                        const provider = String(formData[providerField] || connection.provider || 'other');

                        return (
                            <div key={domain} className="grid grid-cols-1 gap-4 px-5 py-5 xl:grid-cols-[180px_1fr]">
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">{DOMAIN_LABELS[domain]}</div>
                                        <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(connection.status)}`}>
                                            {operationalLabel(connection.status || 'not_connected')}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleTest(domain)}
                                        disabled={testingDomain === domain}
                                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {testingDomain === domain ? 'Testing...' : 'Test'}
                                    </button>
                                    {domain === 'email' && provider === 'outlook' && (
                                        <button
                                            type="button"
                                            onClick={handleSyncEmail}
                                            disabled={syncingEmail}
                                            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                        >
                                            {syncingEmail ? 'Syncing...' : 'Sync Inbox'}
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Provider</label>
                                        <select
                                            value={provider}
                                            onChange={(e) => updateProvider(domain, e.target.value)}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        >
                                            {PROVIDER_OPTIONS[domain].map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Auth Method</label>
                                        <select
                                            value={connection.authMethod || 'none'}
                                            onChange={(e) => updateConnection(domain, { authMethod: e.target.value as IntegrationConnection['authMethod'] })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        >
                                            <option value="none">None</option>
                                            <option value="api_key">API Key</option>
                                            <option value="oauth">OAuth</option>
                                            <option value="webhook">Webhook</option>
                                            <option value="manual">Manual</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Status</label>
                                        <select
                                            value={connection.status || 'not_connected'}
                                            onChange={(e) => updateConnection(domain, { status: e.target.value as IntegrationConnection['status'] })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        >
                                            <option value="not_connected">Not connected</option>
                                            <option value="connected">Connected</option>
                                            <option value="needs_reauth">Needs reauth</option>
                                            <option value="error">Error</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Account ID</label>
                                        <input
                                            type="text"
                                            value={connection.externalAccountId || ''}
                                            onChange={(e) => updateConnection(domain, { externalAccountId: e.target.value })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Location ID</label>
                                        <input
                                            type="text"
                                            value={connection.externalLocationId || ''}
                                            onChange={(e) => updateConnection(domain, { externalLocationId: e.target.value })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Base URL</label>
                                        <input
                                            type="text"
                                            value={connection.baseUrl || ''}
                                            onChange={(e) => updateConnection(domain, { baseUrl: e.target.value })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-gray-600">Webhook URL</label>
                                        <input
                                            type="text"
                                            value={connection.webhookUrl || ''}
                                            onChange={(e) => updateConnection(domain, { webhookUrl: e.target.value })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Webhook Secret</label>
                                        <input
                                            type="password"
                                            value={connection.webhookSecret || ''}
                                            onChange={(e) => updateConnection(domain, { webhookSecret: e.target.value, clearWebhookSecret: false })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                            placeholder={connection.webhookSigningConfigured ? 'Configured; enter new secret to rotate' : 'Minimum 16 characters'}
                                        />
                                        <div className="mt-1 text-xs text-gray-500">
                                            {connection.webhookSigningConfigured ? 'Signing configured' : 'Signing not configured'}
                                            {connection.webhookSecretLastRotatedAt ? ` - Rotated ${new Date(connection.webhookSecretLastRotatedAt).toLocaleDateString()}` : ''}
                                        </div>
                                        {connection.webhookSigningConfigured && (
                                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(connection.clearWebhookSecret)}
                                                    onChange={(e) => updateConnection(domain, { clearWebhookSecret: e.target.checked, webhookSecret: '' })}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                                                />
                                                Clear saved secret
                                            </label>
                                        )}
                                    </div>
                                    <div className="lg:col-span-3">
                                        <label className="block text-xs font-bold uppercase text-gray-600">Capabilities</label>
                                        <input
                                            type="text"
                                            value={capabilitiesToText(connection.capabilities)}
                                            onChange={(e) => updateConnection(domain, { capabilities: capabilitiesFromText(e.target.value) })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <div className="lg:col-span-3">
                                        <label className="block text-xs font-bold uppercase text-gray-600">Notes</label>
                                        <textarea
                                            value={connection.notes || ''}
                                            onChange={(e) => updateConnection(domain, { notes: e.target.value })}
                                            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                            rows={2}
                                        />
                                    </div>
                                    {(connection.lastTestedAt || connection.lastError || connection.executionProvider) && (
                                        <div className="lg:col-span-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                                            {connection.executionProvider && (
                                                <div>Execution provider: {connection.executionProvider}</div>
                                            )}
                                            {connection.lastTestedAt && (
                                                <div>Last tested: {new Date(connection.lastTestedAt).toLocaleString()}</div>
                                            )}
                                            {connection.lastError && (
                                                <div className="text-red-700">{connection.lastError}</div>
                                            )}
                                        </div>
                                    )}
                                    {domain === 'email' && emailSyncSummary && (
                                        <div className="lg:col-span-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                                            {emailSyncSummary}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-5">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                        type="checkbox"
                        checked={formData.kioskModeEnabled}
                        onChange={(e) => setFormData({ ...formData, kioskModeEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    Kiosk mode enabled
                </label>
            </section>

            <button
                type="submit"
                disabled={saving}
                className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400"
            >
                {saving ? 'Saving...' : 'Save Connections'}
            </button>
        </form>
    );
}
