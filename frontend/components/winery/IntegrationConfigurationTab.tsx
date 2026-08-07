'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AreaIntegrationDomain,
    deleteAreaIntegrationDomain,
    IntegrationConnection,
    testAreaIntegrationConnection,
    updateAreaIntegrationConfig,
    Winery,
    WineryOperationalArea
} from '../../lib/api';
import { IntegrationsTab } from './IntegrationsTab';
import { errorMessage } from '../../lib/errors';
import ConfirmDialog from '../ui/ConfirmDialog';
import { operationalLabel } from '../../lib/operationalPresentation';

const DOMAINS: AreaIntegrationDomain[] = ['booking', 'pos', 'crm', 'delivery'];
const LABELS: Record<AreaIntegrationDomain, string> = {
    booking: 'Booking',
    pos: 'Point of Sale',
    crm: 'CRM / Wine Club',
    delivery: 'Delivery'
};
const PROVIDERS: Record<AreaIntegrationDomain, { value: string; label: string }[]> = {
    booking: [
        { value: 'sevenrooms', label: 'SevenRooms' },
        { value: 'resy', label: 'Resy' },
        { value: 'opentable', label: 'OpenTable' },
        { value: 'nowbookit', label: 'Now Book It' },
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
    delivery: [
        { value: 'auspost', label: 'Australia Post' },
        { value: 'shippit', label: 'Shippit' },
        { value: 'startrack', label: 'StarTrack' },
        { value: 'other', label: 'Other / Custom' }
    ]
};
const PROVIDER_FIELDS: Record<AreaIntegrationDomain, 'bookingProvider' | 'posProvider' | 'crmProvider' | 'deliveryProvider'> = {
    booking: 'bookingProvider',
    pos: 'posProvider',
    crm: 'crmProvider',
    delivery: 'deliveryProvider'
};

function copyConnections(area?: WineryOperationalArea): Partial<Record<AreaIntegrationDomain, IntegrationConnection>> {
    return Object.fromEntries(Object.entries(area?.IntegrationConfig?.providerConnections || {}).map(([domain, value]) => [
        domain,
        { ...value, capabilities: [...(value?.capabilities || [])], webhookSecret: '', clearWebhookSecret: false }
    ]));
}

function statusClass(status?: string) {
    if (status === 'connected') return 'border-green-200 bg-green-50 text-green-700';
    if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
    if (status === 'needs_reauth') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-gray-200 bg-gray-50 text-gray-600';
}

export function IntegrationConfigurationTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const areas = useMemo(() => winery.OperationalAreas || [], [winery.OperationalAreas]);
    const preferredAreaId = winery.configurationAccess?.managedAreaIds?.[0] || areas[0]?.id || 0;
    const [selectedAreaId, setSelectedAreaId] = useState(preferredAreaId);
    const selectedArea = areas.find(area => area.id === selectedAreaId) || areas[0];
    const [drafts, setDrafts] = useState<Partial<Record<AreaIntegrationDomain, IntegrationConnection>>>(() => copyConnections(selectedArea));
    const [busyDomain, setBusyDomain] = useState<AreaIntegrationDomain | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [removalRequested, setRemovalRequested] = useState<AreaIntegrationDomain | null>(null);

    useEffect(() => {
        setDrafts(copyConnections(selectedArea));
    }, [selectedArea]);

    if (!selectedArea) return <p className="text-sm text-gray-600">Create an operational area before assigning integration connections.</p>;

    const canEdit = Boolean(
        winery.configurationAccess?.isGlobalManager
        || winery.configurationAccess?.managedAreaIds?.includes(selectedArea.id)
    );
    const globalConnections = winery.integrationConfig?.providerConnections || {};

    function inheritedConnection(domain: AreaIntegrationDomain): IntegrationConnection {
        return globalConnections[domain] || {
            provider: winery.integrationConfig?.[PROVIDER_FIELDS[domain]] || 'other',
            status: 'not_connected',
            capabilities: []
        };
    }

    function createOverride(domain: AreaIntegrationDomain) {
        const inherited = inheritedConnection(domain);
        setDrafts(current => ({
            ...current,
            [domain]: {
                ...inherited,
                provider: inherited.provider || winery.integrationConfig?.[PROVIDER_FIELDS[domain]] || 'other',
                webhookUrl: `/api/webhooks/integration/${winery.id}/${domain}/${selectedArea.id}`,
                webhookSecret: '',
                clearWebhookSecret: false
            }
        }));
    }

    function updateDraft(domain: AreaIntegrationDomain, updates: Partial<IntegrationConnection>) {
        setDrafts(current => ({
            ...current,
            [domain]: { ...(current[domain] || inheritedConnection(domain)), ...updates }
        }));
    }

    async function save(domain: AreaIntegrationDomain) {
        const connection = drafts[domain];
        if (!connection) return;
        setFeedback(null);
        setBusyDomain(domain);
        try {
            const saved = await updateAreaIntegrationConfig(selectedArea.id, { [domain]: connection });
            setDrafts(current => ({ ...current, [domain]: saved.providerConnections[domain] }));
            onUpdate();
        } catch (error: unknown) {
            setFeedback(errorMessage(error, 'Failed to save area integration'));
        } finally {
            setBusyDomain(null);
        }
    }

    async function confirmRemove() {
        const domain = removalRequested;
        if (!domain) return;
        setFeedback(null);
        setBusyDomain(domain);
        try {
            await deleteAreaIntegrationDomain(selectedArea.id, domain);
            setDrafts(current => {
                const next = { ...current };
                delete next[domain];
                return next;
            });
            onUpdate();
        } catch (error: unknown) {
            const message = errorMessage(error, 'Failed to remove area integration');
            setFeedback(message);
            throw new Error(message);
        } finally {
            setBusyDomain(null);
        }
    }

    async function test(domain: AreaIntegrationDomain) {
        setFeedback(null);
        setBusyDomain(domain);
        try {
            const result = await testAreaIntegrationConnection(selectedArea.id, domain);
            updateDraft(domain, result);
            onUpdate();
        } catch (error: unknown) {
            setFeedback(errorMessage(error, 'Failed to test area integration'));
        } finally {
            setBusyDomain(null);
        }
    }

    return (
        <>
        <div className="space-y-8">
            <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Area connections</h2>
                        <p className="mt-1 text-sm text-gray-600">Area overrides are used for routed webhooks and booking/CRM execution. Unconfigured domains inherit the winery default.</p>
                    </div>
                    <label className="text-sm font-medium text-gray-700">
                        Operational area
                        <select
                            value={selectedArea.id}
                            onChange={event => setSelectedAreaId(Number(event.target.value))}
                            className="mt-1 block min-w-56 rounded-md border border-gray-300 bg-white p-2"
                        >
                            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                        </select>
                    </label>
                </div>

                {!canEdit && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        You can read this area&apos;s connections. Only its area manager or a winery manager can change them.
                    </div>
                )}
                {feedback && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}

                <div className="grid gap-4 xl:grid-cols-2">
                    {DOMAINS.map(domain => {
                        const override = drafts[domain];
                        const effective = override || inheritedConnection(domain);
                        const provider = effective.provider || 'other';
                        const options = PROVIDERS[domain];
                        return (
                            <article key={domain} className="rounded-lg border border-gray-200 bg-white p-5">
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{LABELS[domain]}</h3>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(effective.status)}`}>
                                                {operationalLabel(effective.status || 'not_connected')}
                                            </span>
                                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600">
                                                {override ? 'Area override' : 'Winery default'}
                                            </span>
                                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${effective.liveAdapterAvailable ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                {effective.liveAdapterAvailable ? 'Live adapter available' : 'Configuration only — live actions unavailable'}
                                            </span>
                                        </div>
                                    </div>
                                    {!override && canEdit && (
                                        <button type="button" onClick={() => createOverride(domain)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                            Override
                                        </button>
                                    )}
                                </div>

                                {!override ? (
                                    <dl className="grid grid-cols-2 gap-3 text-sm">
                                        <div><dt className="text-gray-500">Provider</dt><dd className="font-medium text-gray-900">{provider}</dd></div>
                                        <div><dt className="text-gray-500">Account</dt><dd className="font-medium text-gray-900">{effective.externalAccountId || 'Not set'}</dd></div>
                                    </dl>
                                ) : (
                                    <fieldset disabled={!canEdit || busyDomain === domain} className="space-y-4 disabled:opacity-70">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="text-xs font-bold uppercase text-gray-600">Provider
                                                <select value={provider} onChange={event => updateDraft(domain, { provider: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm">
                                                    {!options.some(option => option.value === provider) && <option value={provider}>{provider}</option>}
                                                    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="text-xs font-bold uppercase text-gray-600">Auth method
                                                <select value={effective.authMethod || 'none'} onChange={event => updateDraft(domain, { authMethod: event.target.value as IntegrationConnection['authMethod'] })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm">
                                                    {['none', 'api_key', 'oauth', 'webhook', 'manual'].map(value => <option key={value} value={value}>{operationalLabel(value)}</option>)}
                                                </select>
                                            </label>
                                            <label className="text-xs font-bold uppercase text-gray-600">Account ID
                                                <input value={effective.externalAccountId || ''} onChange={event => updateDraft(domain, { externalAccountId: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                            </label>
                                            <label className="text-xs font-bold uppercase text-gray-600">Location ID
                                                <input value={effective.externalLocationId || ''} onChange={event => updateDraft(domain, { externalLocationId: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                            </label>
                                        </div>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Base URL
                                            <input value={effective.baseUrl || ''} onChange={event => updateDraft(domain, { baseUrl: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                        </label>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Webhook URL
                                            <input value={effective.webhookUrl || ''} onChange={event => updateDraft(domain, { webhookUrl: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                        </label>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Webhook secret
                                            <input type="password" value={effective.webhookSecret || ''} onChange={event => updateDraft(domain, { webhookSecret: event.target.value, clearWebhookSecret: false })} placeholder={effective.webhookSigningConfigured ? 'Configured; enter a new secret to rotate' : 'Minimum 16 characters'} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                        </label>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Capabilities
                                            <input value={(effective.capabilities || []).join(', ')} onChange={event => updateDraft(domain, { capabilities: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                        </label>
                                        <label className="block text-xs font-bold uppercase text-gray-600">Notes
                                            <textarea value={effective.notes || ''} onChange={event => updateDraft(domain, { notes: event.target.value })} rows={2} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" />
                                        </label>
                                        {effective.lastError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{effective.lastError}</p>}
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => save(domain)} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save override</button>
                                            <button type="button" onClick={() => test(domain)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Test</button>
                                            <button type="button" onClick={() => setRemovalRequested(domain)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Use winery default</button>
                                        </div>
                                    </fieldset>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-4 border-t border-gray-200 pt-8">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Winery defaults and communication channels</h2>
                    <p className="mt-1 text-sm text-gray-600">SMS, email, and fallback operational connections are shared across the winery.</p>
                </div>
                {!winery.configurationAccess?.isGlobalManager && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">These shared defaults are read-only for area managers.</div>
                )}
                <fieldset disabled={!winery.configurationAccess?.isGlobalManager} className="disabled:opacity-75">
                    <IntegrationsTab winery={winery} onUpdate={onUpdate} />
                </fieldset>
            </section>
        </div>
        <ConfirmDialog
            open={removalRequested !== null}
            onClose={() => setRemovalRequested(null)}
            onConfirm={confirmRemove}
            title="Remove area override?"
            description={removalRequested ? `${LABELS[removalRequested]} will use the winery default for ${selectedArea.name}.` : ''}
            confirmLabel="Use winery default"
            destructive
        />
        </>
    );
}
