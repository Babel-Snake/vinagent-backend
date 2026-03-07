'use client';

import { useState } from 'react';
import { updateIntegrationConfig } from '../../lib/api';

export function IntegrationsTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    const config = winery.integrationConfig || {};
    const [formData, setFormData] = useState({
        smsProvider: config.smsProvider || 'twilio',
        smsFromNumber: config.smsFromNumber || '',
        emailProvider: config.emailProvider || 'sendgrid',
        emailFromAddress: config.emailFromAddress || '',
        kioskModeEnabled: config.kioskModeEnabled || false,
        posProvider: config.posProvider || 'other',
        crmProvider: config.crmProvider || 'other',
        bookingProvider: config.bookingProvider || 'other',
        deliveryProvider: config.deliveryProvider || 'other'
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateIntegrationConfig(formData);
            alert('Integrations Saved!');
            onUpdate();
        } catch (e) { alert('Failed to save'); }
        finally { setSaving(false); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Channels</h3>
                <div className="grid grid-cols-1 gap-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">SMS Provider</label>
                        <select value={formData.smsProvider} onChange={e => setFormData({ ...formData, smsProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="twilio">Twilio</option>
                            <option value="messagemedia">MessageMedia</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">SMS From Number (Sender ID)</label>
                        <input type="text" value={formData.smsFromNumber} onChange={e => setFormData({ ...formData, smsFromNumber: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="+614..." />
                    </div>

                    <div className="border-t pt-4">
                        <label className="block text-sm font-medium text-gray-700">Email Provider</label>
                        <select value={formData.emailProvider} onChange={e => setFormData({ ...formData, emailProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="sendgrid">SendGrid</option>
                            <option value="mailgun">Mailgun</option>
                            <option value="ses">AWS SES</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">From Email Address</label>
                        <input type="email" value={formData.emailFromAddress} onChange={e => setFormData({ ...formData, emailFromAddress: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="hello@winery.com" />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Operational Systems</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Point of Sale (POS)</label>
                        <select value={formData.posProvider} onChange={e => setFormData({ ...formData, posProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="square">Square</option>
                            <option value="shopify">Shopify</option>
                            <option value="vend">Vend</option>
                            <option value="lightspeed">Lightspeed</option>
                            <option value="other">Other / Custom</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">CRM / Wine Club</label>
                        <select value={formData.crmProvider} onChange={e => setFormData({ ...formData, crmProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="commerce7">Commerce7</option>
                            <option value="winedirect">WineDirect</option>
                            <option value="ecellar">eCellar</option>
                            <option value="other">Other / Custom</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Booking System</label>
                        <select value={formData.bookingProvider} onChange={e => setFormData({ ...formData, bookingProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="sevenrooms">SevenRooms</option>
                            <option value="resy">Resy</option>
                            <option value="opentable">OpenTable</option>
                            <option value="nowbookit">Now Book It</option>
                            <option value="other">Other / Custom</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Delivery / Tracking</label>
                        <select value={formData.deliveryProvider} onChange={e => setFormData({ ...formData, deliveryProvider: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="auspost">Australia Post</option>
                            <option value="shippit">Shippit</option>
                            <option value="startrack">StarTrack</option>
                            <option value="other">Other / Custom</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                <h3 className="text-lg font-medium text-yellow-900 mb-2">Kiosk Mode</h3>
                <div className="flex items-center">
                    <input type="checkbox" checked={formData.kioskModeEnabled} onChange={e => setFormData({ ...formData, kioskModeEnabled: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                    <label className="ml-2 text-sm text-yellow-900">Enable Kiosk Mode for device activation</label>
                </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400">
                {saving ? 'Saving...' : 'Save Integrations'}
            </button>
        </form>
    );
}
