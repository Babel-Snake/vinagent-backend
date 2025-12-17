'use client';

import { useState } from 'react';
import { updatePolicyProfile, createFAQ, deleteFAQ } from '../../lib/api';

export function PoliciesTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    // 1. Policy Profile (Long text fields)
    const profile = winery.policyProfile || {};
    const [profileForm, setProfileForm] = useState({
        shippingTimeframesText: profile.shippingTimeframesText || '',
        returnsRefundsPolicyText: profile.returnsRefundsPolicyText || '',
        wineClubSummary: profile.wineClubSummary || '',
        accessibilityNotes: profile.accessibilityNotes || '',
        eventPolicy: profile.eventPolicy || ''
    });

    // 2. FAQs (List)
    const faqs = winery.faqs || [];
    const [newFAQ, setNewFAQ] = useState({ question: '', answer: '', tags: '' });

    const [saving, setSaving] = useState(false);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updatePolicyProfile(profileForm);
            alert('Policies Saved!');
            onUpdate();
        } catch (e) { alert('Failed to save policies'); }
        finally { setSaving(false); }
    };

    const handleCreateFAQ = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const tagsArray = newFAQ.tags.split(',').map(s => s.trim()).filter(Boolean);
            await createFAQ({ ...newFAQ, tags: tagsArray });
            setNewFAQ({ question: '', answer: '', tags: '' });
            onUpdate();
        } catch (e) { alert('Failed to create FAQ'); }
    };

    const handleDeleteFAQ = async (id: number) => {
        if (!confirm('Delete this FAQ?')) return;
        try {
            await deleteFAQ(id);
            onUpdate();
        } catch (e) { alert('Failed'); }
    };

    return (
        <div className="space-y-8">
            {/* Policy Profile Form */}
            <form onSubmit={handleProfileSubmit} className="bg-white p-6 rounded-lg border border-gray-200 space-y-6">
                <h3 className="text-lg font-medium text-gray-900">Standard Operating Policies</h3>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Shipping Timeframes</label>
                    <textarea rows={2} value={profileForm.shippingTimeframesText} onChange={e => setProfileForm({ ...profileForm, shippingTimeframesText: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Returns & Refunds</label>
                    <textarea rows={2} value={profileForm.returnsRefundsPolicyText} onChange={e => setProfileForm({ ...profileForm, returnsRefundsPolicyText: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Wine Club Summary</label>
                    <textarea rows={2} value={profileForm.wineClubSummary} onChange={e => setProfileForm({ ...profileForm, wineClubSummary: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                </div>

                <button type="submit" disabled={saving} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                    {saving ? 'Saving...' : 'Save Policies'}
                </button>
            </form>

            {/* FAQ Manager */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Frequently Asked Questions (AI Knowledge Base)</h3>

                {faqs.map((faq: any) => (
                    <div key={faq.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleDeleteFAQ(faq.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900">{faq.question}</h4>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{faq.answer}</p>
                    </div>
                ))}

                {/* Add FAQ */}
                <form onSubmit={handleCreateFAQ} className="bg-gray-100 p-4 rounded-lg flex flex-col gap-4">
                    <h4 className="text-sm font-medium text-gray-700">Add New Q&A Pair</h4>
                    <input type="text" placeholder="Question" required value={newFAQ.question} onChange={e => setNewFAQ({ ...newFAQ, question: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <textarea rows={2} placeholder="Answer" required value={newFAQ.answer} onChange={e => setNewFAQ({ ...newFAQ, answer: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <div className="flex justify-between items-center">
                        <input type="text" placeholder="Tags (e.g. shipping, dogs)" value={newFAQ.tags} onChange={e => setNewFAQ({ ...newFAQ, tags: e.target.value })} className="block w-2/3 rounded-md border-gray-300 shadow-sm border p-2 text-sm" />
                        <button type="submit" className="ml-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">Add FAQ</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
