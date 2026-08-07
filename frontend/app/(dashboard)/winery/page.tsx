'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getWineryFull, type Winery } from '../../../lib/api';
import { OverviewTab } from '../../../components/winery/OverviewTab';
import { BrandTab } from '../../../components/winery/BrandTab';
import { BookingsTab } from '../../../components/winery/BookingsTab';
import { ProductConfigurationTab } from '../../../components/winery/ProductConfigurationTab';
import { PoliciesTab } from '../../../components/winery/PoliciesTab';
import { IntegrationConfigurationTab } from '../../../components/winery/IntegrationConfigurationTab';
import { OrganisationTab } from '../../../components/winery/OrganisationTab';
import { AreaProfilesTab } from '../../../components/winery/AreaProfilesTab';
import { IntelligenceSettingsTab } from '../../../components/winery/IntelligenceSettingsTab';
import { StaffManagement } from '../staff/page';
import { clientLogger } from '../../../lib/clientLogger';

export default function WineryPage() {
    const [winery, setWinery] = useState<Winery | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const loadWinery = async () => {
        try {
            setLoading(true);
            const res = await getWineryFull();
            setWinery(res);
            setLoadError(null);
        } catch (e) {
            clientLogger.error(e);
            setLoadError(e instanceof Error ? e.message : 'Failed to load winery profile');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadWinery();
    }, [refreshTrigger]);

    const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

    if (loading) return (
        <div className="p-8 text-center text-[var(--muted)]">Loading winery profile...</div>
    );

    if (!winery) return (
        <div className="page-shell">
            <div role="alert" className="surface-panel border-red-200 bg-red-50 text-red-800">
                <p className="font-semibold">Winery configuration could not be loaded.</p>
                {loadError && <p className="mt-1 text-sm">{loadError}</p>}
                <button type="button" onClick={loadWinery} className="btn-secondary mt-4">Try again</button>
            </div>
        </div>
    );

    const isGlobalManager = Boolean(winery.configurationAccess?.isGlobalManager);
    const tabGroups = [
        {
            label: 'General',
            tabs: [
                { id: 'overview', label: 'Overview' },
                { id: 'brand', label: 'Brand & Voice' }
            ]
        },
        {
            label: 'Operations',
            tabs: [
                { id: 'areas', label: 'Area Profiles' },
                { id: 'products', label: 'Products' },
                { id: 'bookings', label: 'Bookings' },
                { id: 'policies', label: 'Policies & FAQs' }
            ]
        },
        {
            label: 'Team',
            tabs: [
                { id: 'organisation', label: 'Organisation' },
                ...(isGlobalManager ? [{ id: 'staff', label: 'Staff & Access' }] : [])
            ]
        },
        {
            label: 'System',
            tabs: [
                { id: 'integrations', label: 'Integrations' },
                { id: 'intelligence', label: 'Intelligence' }
            ]
        }
    ];

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Winery configuration</h1>
                    <p className="page-kicker">Brand profile, policies, products, bookings, staff access, contacts, and integrations used by AI triage.</p>
                </div>
            </div>

            <div className="surface-panel overflow-hidden md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
                <nav className="border-b border-[var(--border)] bg-[#f8faf6] p-3 md:border-b-0 md:border-r" aria-label="Winery configuration sections">
                    <div className="grid gap-4 sm:grid-cols-2 md:block">
                        {tabGroups.map(group => (
                            <div key={group.label}>
                                <h2 className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.label}</h2>
                                <div className="space-y-1">
                                    {group.tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            aria-current={activeTab === tab.id ? 'page' : undefined}
                                            className={`${activeTab === tab.id
                                                ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                                                : 'text-[var(--muted)] hover:bg-[#eef1e8] hover:text-[#1c231f]'
                                                } w-full rounded-md px-3 py-2 text-left text-sm font-medium`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </nav>

                <div className="min-w-0 p-5">
                    {activeTab === 'overview' && <GlobalConfigurationSection editable={isGlobalManager}><OverviewTab winery={winery} onUpdate={handleRefresh} /></GlobalConfigurationSection>}
                    {activeTab === 'areas' && <AreaProfilesTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'brand' && <GlobalConfigurationSection editable={isGlobalManager}><BrandTab winery={winery} onUpdate={handleRefresh} /></GlobalConfigurationSection>}
                    {activeTab === 'bookings' && <BookingsTab winery={winery} onUpdate={handleRefresh} />}
                    { activeTab === 'products' && <ProductConfigurationTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'policies' && <PoliciesTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'organisation' && <OrganisationTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'staff' && <StaffManagement embedded winery={winery} onSettingsUpdated={handleRefresh} /> }
                    { activeTab === 'integrations' && <IntegrationConfigurationTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'intelligence' && <GlobalConfigurationSection editable={isGlobalManager}><IntelligenceSettingsTab /></GlobalConfigurationSection> }
                </div>
            </div>
        </div>
    );
}

function GlobalConfigurationSection({ editable, children }: { editable: boolean, children: ReactNode }) {
    return (
        <div className="space-y-4">
            {!editable && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Organisation-level settings are readable by area managers and editable by winery managers.</div>}
            <fieldset disabled={!editable} className="disabled:opacity-75">{children}</fieldset>
        </div>
    );
}
