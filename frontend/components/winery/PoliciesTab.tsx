'use client';

import { useState } from 'react';
import { createFAQ, updateFAQ, deleteFAQ, createSOP, updateSOP, deleteSOP } from '../../lib/api';

export function PoliciesTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    // 1. SOPs (Dynamic List)
    const sops = winery.sops || [];
    const [newSOP, setNewSOP] = useState({ title: '', body: '' });
    const [editingSOP, setEditingSOP] = useState<any>(null);

    // 2. FAQs (List)
    const faqs = winery.faqs || [];
    const [newFAQ, setNewFAQ] = useState({ question: '', answer: '', tags: '' });
    const [editingFAQ, setEditingFAQ] = useState<any>(null);

    const [saving, setSaving] = useState(false);
    const [savingFAQ, setSavingFAQ] = useState(false);

    const tagsToInput = (tags: any) => Array.isArray(tags) ? tags.join(', ') : (tags || '');
    const tagsFromInput = (tags: string) => tags.split(',').map(s => s.trim()).filter(Boolean);

    const handleCreateSOP = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await createSOP(newSOP);
            setNewSOP({ title: '', body: '' });
            onUpdate();
        } catch (e) { alert('Failed to create SOP'); }
        finally { setSaving(false); }
    };

    const handleUpdateSOP = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateSOP(id, { title: editingSOP.title, body: editingSOP.body });
            setEditingSOP(null);
            onUpdate();
        } catch (e) { alert('Failed to update SOP'); }
        finally { setSaving(false); }
    };

    const handleDeleteSOP = async (id: number) => {
        if (!confirm('Delete this SOP?')) return;
        try {
            await deleteSOP(id);
            onUpdate();
        } catch (e) { alert('Failed'); }
    };

    const handleCreateFAQ = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createFAQ({ ...newFAQ, tags: tagsFromInput(newFAQ.tags) });
            setNewFAQ({ question: '', answer: '', tags: '' });
            onUpdate();
        } catch (e) { alert('Failed to create FAQ'); }
    };

    const handleEditFAQ = (faq: any) => {
        setEditingFAQ({
            id: faq.id,
            question: faq.question || '',
            answer: faq.answer || '',
            tags: tagsToInput(faq.tags)
        });
    };

    const handleUpdateFAQ = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        setSavingFAQ(true);
        try {
            await updateFAQ(id, {
                question: editingFAQ.question,
                answer: editingFAQ.answer,
                tags: tagsFromInput(editingFAQ.tags)
            });
            setEditingFAQ(null);
            onUpdate();
        } catch (e) {
            alert('Failed to update FAQ');
        } finally {
            setSavingFAQ(false);
        }
    };

    const handleDeleteFAQ = async (id: number) => {
        if (!confirm('Delete this FAQ?')) return;
        try {
            await deleteFAQ(id);
            if (editingFAQ?.id === id) setEditingFAQ(null);
            onUpdate();
        } catch (e) { alert('Failed'); }
    };

    return (
        <div className="space-y-8">
            {/* SOP Manager */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Standard Operating Policies</h3>

                {sops.map((sop: any) => (
                    <div key={sop.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                            <button onClick={() => setEditingSOP(sop)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                            <button onClick={() => handleDeleteSOP(sop.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </div>
                        {editingSOP?.id === sop.id ? (
                            <form onSubmit={(e) => handleUpdateSOP(e, sop.id)} className="space-y-2 mt-2">
                                <input type="text" required value={editingSOP.title} onChange={e => setEditingSOP({ ...editingSOP, title: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2 font-medium" />
                                <textarea rows={3} required value={editingSOP.body} onChange={e => setEditingSOP({ ...editingSOP, body: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm" />
                                <div className="flex space-x-2">
                                    <button type="submit" disabled={saving} className="inline-flex py-1 px-3 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700">Save</button>
                                    <button type="button" onClick={() => setEditingSOP(null)} className="inline-flex py-1 px-3 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <h4 className="text-sm font-semibold text-gray-900">{sop.title}</h4>
                                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{sop.body}</p>
                            </>
                        )}
                    </div>
                ))}

                {/* Add SOP */}
                <form onSubmit={handleCreateSOP} className="bg-gray-50 p-4 rounded-lg flex flex-col gap-4 border border-dashed border-gray-300 shadow-sm">
                    <h4 className="text-sm font-medium text-gray-700">Add New Policy</h4>
                    <input type="text" placeholder="Policy Title (e.g. Shipping Timeframes)" required value={newSOP.title} onChange={e => setNewSOP({ ...newSOP, title: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <textarea rows={3} placeholder="Policy Body" required value={newSOP.body} onChange={e => setNewSOP({ ...newSOP, body: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <div className="flex justify-end">
                        <button type="submit" disabled={saving} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                            {saving ? 'Adding...' : 'Add Policy'}
                        </button>
                    </div>
                </form>
            </div>

            {/* FAQ Manager */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Frequently Asked Questions (AI Knowledge Base)</h3>

                {faqs.map((faq: any) => (
                    <div key={faq.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                            <button onClick={() => handleEditFAQ(faq)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                            <button onClick={() => handleDeleteFAQ(faq.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </div>
                        {editingFAQ?.id === faq.id ? (
                            <form onSubmit={(e) => handleUpdateFAQ(e, faq.id)} className="space-y-3 pr-16">
                                <input
                                    type="text"
                                    required
                                    value={editingFAQ.question}
                                    onChange={e => setEditingFAQ({ ...editingFAQ, question: e.target.value })}
                                    className="block w-full rounded-md border-gray-300 shadow-sm border p-2 font-medium"
                                />
                                <textarea
                                    rows={3}
                                    required
                                    value={editingFAQ.answer}
                                    onChange={e => setEditingFAQ({ ...editingFAQ, answer: e.target.value })}
                                    className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                />
                                <input
                                    type="text"
                                    placeholder="Tags (e.g. shipping, dogs)"
                                    value={editingFAQ.tags}
                                    onChange={e => setEditingFAQ({ ...editingFAQ, tags: e.target.value })}
                                    className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                />
                                <div className="flex space-x-2">
                                    <button type="submit" disabled={savingFAQ} className="inline-flex py-1 px-3 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                                        {savingFAQ ? 'Saving...' : 'Save'}
                                    </button>
                                    <button type="button" onClick={() => setEditingFAQ(null)} className="inline-flex py-1 px-3 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <h4 className="text-sm font-semibold text-gray-900 pr-16">{faq.question}</h4>
                                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{faq.answer}</p>
                                {Array.isArray(faq.tags) && faq.tags.length > 0 && (
                                    <p className="mt-2 text-xs text-gray-400">{faq.tags.join(', ')}</p>
                                )}
                            </>
                        )}
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
