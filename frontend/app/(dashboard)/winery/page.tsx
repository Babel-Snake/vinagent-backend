'use client';

import { useEffect, useState } from 'react';
import { getWineryFull } from '../../../lib/api';
import { OverviewTab } from '../../../components/winery/OverviewTab';
import { BrandTab } from '../../../components/winery/BrandTab';
import { BookingsTab } from '../../../components/winery/BookingsTab';
import { ProductsTab } from '../../../components/winery/ProductsTab';
import { PoliciesTab } from '../../../components/winery/PoliciesTab';
import { IntegrationsTab } from '../../../components/winery/IntegrationsTab';

export default function WineryPage() {
    const [winery, setWinery] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const loadWinery = async () => {
        try {
            setLoading(true);
            const res = await getWineryFull();
            setWinery(res.data);
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
        <div className="p-8 text-center text-gray-500">Loading Winery Profile...</div>
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
        { id: 'integrations', label: 'Integrations' },
    ];

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Winery Configuration</h1>
                <span className="text-sm text-gray-500">ID: {winery.id}</span>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex px-6 space-x-8" aria-label="Tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'overview' && <OverviewTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'brand' && <BrandTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'bookings' && <BookingsTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'products' && <ProductsTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'policies' && <PoliciesTab winery={winery} onUpdate={handleRefresh} />}
                    {activeTab === 'integrations' && <IntegrationsTab winery={winery} onUpdate={handleRefresh} />}
                </div>
            </div>
        </div>
    );
}
