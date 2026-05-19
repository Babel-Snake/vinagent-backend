'use client';

import { useEffect, useState } from 'react';
import { getWineryFull } from '../../../lib/api';
import { OverviewTab } from '../../../components/winery/OverviewTab';
import { BrandTab } from '../../../components/winery/BrandTab';
import { BookingsTab } from '../../../components/winery/BookingsTab';
import { ProductsTab } from '../../../components/winery/ProductsTab';
import { PoliciesTab } from '../../../components/winery/PoliciesTab';
import { IntegrationsTab } from '../../../components/winery/IntegrationsTab';
import { OrganisationTab } from '../../../components/winery/OrganisationTab';
import { StaffManagement } from '../staff/page';

export default function WineryPage() {
    const [winery, setWinery] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const loadWinery = async () => {
        try {
            setLoading(true);
            const res = await getWineryFull();
            setWinery(res);
        } catch (e) {
            console.error(e);
            alert('Failed to load winery profile');
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
        <div className="p-8 text-center text-red-500">Failed to load profile.</div>
    );

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'brand', label: 'Brand & Voice' },
        { id: 'bookings', label: 'Bookings' },
        { id: 'products', label: 'Products' },
        { id: 'policies', label: 'Policies & FAQs' },
        { id: 'organisation', label: 'Organisation' },
        { id: 'staff', label: 'Staff & Access' },
        { id: 'integrations', label: 'Integrations' },
    ];

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="text-2xl font-semibold text-[#1c231f]">Winery configuration</h1>
                    <p className="page-kicker">Brand profile, policies, products, bookings, staff access, contacts, and integrations used by AI triage.</p>
                </div>
                <span className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--muted)]">ID: {winery.id}</span>
            </div>

            <div className="surface-panel overflow-hidden">
                <div className="border-b border-[var(--border)]">
                    <nav className="-mb-px flex gap-2 overflow-x-auto px-4 py-2" aria-label="Tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${activeTab === tab.id
                                    ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                                    : 'text-[var(--muted)] hover:bg-[#eef1e8] hover:text-[#1c231f]'
                                    } whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-5">
                    {activeTab === 'overview' && <OverviewTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'brand' && <BrandTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'bookings' && <BookingsTab winery={winery} onUpdate={handleRefresh} />}
                    { activeTab === 'products' && <ProductsTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'policies' && <PoliciesTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'organisation' && <OrganisationTab winery={winery} onUpdate={handleRefresh} /> }
                    { activeTab === 'staff' && <StaffManagement embedded winery={winery} onSettingsUpdated={handleRefresh} /> }
                    { activeTab === 'integrations' && <IntegrationsTab winery={winery} onUpdate={handleRefresh} /> }
                </div>
            </div>
        </div>
    );
}
