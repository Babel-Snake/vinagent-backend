'use client';

import { useState } from 'react';
import { updateOverview } from '../../lib/api';

export function OverviewTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    const [formData, setFormData] = useState({
        name: winery.name,
        shortName: winery.shortName || '',
        region: winery.region || '',
        contactEmail: winery.contactEmail || '',
        contactPhone: winery.contactPhone || '',
        publicEmail: winery.publicEmail || '',
        publicPhone: winery.publicPhone || '',
        website: winery.website || '',
        timeZone: winery.timeZone,
        // Address
        addressLine1: winery.addressLine1 || '',
        addressLine2: winery.addressLine2 || '',
        suburb: winery.suburb || '',
        state: winery.state || '',
        postcode: winery.postcode || '',
        country: winery.country || 'Australia'
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateOverview(formData);
            alert('Settings Saved!');
            onUpdate();
        } catch (e) {
            alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
            {/* Identity */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Identity</h3>
                <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Winery Name (Official)</label>
                        <input type="text" required value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Short Name (Chat Friendly)</label>
                        <input type="text" value={formData.shortName} onChange={e => handleChange('shortName', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Region</label>
                        <input type="text" value={formData.region} onChange={e => handleChange('region', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Timezone</label>
                        <input type="text" value={formData.timeZone} onChange={e => handleChange('timeZone', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                </div>
            </div>

            {/* Address */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Location</h3>
                <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Street Address</label>
                        <input type="text" value={formData.addressLine1} onChange={e => handleChange('addressLine1', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Suburb</label>
                        <input type="text" value={formData.suburb} onChange={e => handleChange('suburb', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">State</label>
                        <input type="text" value={formData.state} onChange={e => handleChange('state', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Postcode</label>
                        <input type="text" value={formData.postcode} onChange={e => handleChange('postcode', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                </div>
            </div>

            {/* Contacts */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Details</h3>
                <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-6">
                     <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Public Phone (For Customers)</label>
                        <input type="text" value={formData.publicPhone} onChange={e => handleChange('publicPhone', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Public Email (For Customers)</label>
                        <input type="email" value={formData.publicEmail} onChange={e => handleChange('publicEmail', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Ops Phone (Private)</label>
                        <input type="text" value={formData.contactPhone} onChange={e => handleChange('contactPhone', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Ops Email (Private)</label>
                        <input type="email" value={formData.contactEmail} onChange={e => handleChange('contactEmail', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Website URL</label>
                        <input type="url" value={formData.website} onChange={e => handleChange('website', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                </div>
            </div>

            <div>
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400"
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </form>
    );
}
