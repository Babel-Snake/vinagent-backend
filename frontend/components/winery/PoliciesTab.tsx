'use client';

import { useState } from 'react';
import {
    createFAQ,
    updateFAQ,
    deleteFAQ,
    createSOP,
    updateSOP,
    deleteSOP,
    type Winery,
    type WineryFAQ,
    type WinerySop
} from '../../lib/api';
import ConfirmDialog from '../ui/ConfirmDialog';

type EditingFAQ = Omit<WineryFAQ, 'tags'> & { tags: string };

export function PoliciesTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const areas = winery.OperationalAreas || [];
    const isGlobalManager = Boolean(winery.configurationAccess?.isGlobalManager);
    const [selectedAreaId, setSelectedAreaId] = useState<number>(
        isGlobalManager ? 0 : (winery.configurationAccess?.managedAreaIds?.[0] || areas[0]?.id || 0)
    );
    const selectedArea = areas.find(area => area.id === selectedAreaId);
    const canEdit = isGlobalManager || Boolean(winery.configurationAccess?.managedAreaIds?.includes(selectedAreaId));

    // 1. SOPs (Dynamic List)
    const sops = (winery.sops || []).filter(sop => Number(sop.areaId || 0) === selectedAreaId);
    const [newSOP, setNewSOP] = useState({ title: '', body: '' });
    const [editingSOP, setEditingSOP] = useState<WinerySop | null>(null);

    // 2. FAQs (List)
    const faqs = (winery.faqs || []).filter(faq => Number(faq.areaId || 0) === selectedAreaId);
    const [newFAQ, setNewFAQ] = useState({ question: '', answer: '', tags: '' });
    const [editingFAQ, setEditingFAQ] = useState<EditingFAQ | null>(null);

    const [saving, setSaving] = useState(false);
    const [savingFAQ, setSavingFAQ] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [pendingDeletion, setPendingDeletion] = useState<{ kind: 'sop' | 'faq'; id: number; title: string } | null>(null);

    const tagsToInput = (tags?: string[]) => tags?.join(', ') || '';
    const tagsFromInput = (tags: string) => tags.split(',').map(s => s.trim()).filter(Boolean);

    const handleCreateSOP = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setSaving(true);
        try {
            await createSOP({ ...newSOP, areaId: selectedAreaId || null });
            setNewSOP({ title: '', body: '' });
            onUpdate();
        } catch (error) { setFeedback(error instanceof Error ? error.message : 'Failed to create SOP'); }
        finally { setSaving(false); }
    };

    const handleUpdateSOP = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        if (!editingSOP) return;
        setFeedback(null);
        setSaving(true);
        try {
            await updateSOP(id, { title: editingSOP.title, body: editingSOP.body });
            setEditingSOP(null);
            onUpdate();
        } catch (error) { setFeedback(error instanceof Error ? error.message : 'Failed to update SOP'); }
        finally { setSaving(false); }
    };

    const handleCreateFAQ = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        try {
            await createFAQ({ ...newFAQ, areaId: selectedAreaId || null, tags: tagsFromInput(newFAQ.tags) });
            setNewFAQ({ question: '', answer: '', tags: '' });
            onUpdate();
        } catch (error) { setFeedback(error instanceof Error ? error.message : 'Failed to create FAQ'); }
    };

    const handleEditFAQ = (faq: WineryFAQ) => {
        setEditingFAQ({
            id: faq.id,
            question: faq.question || '',
            answer: faq.answer || '',
            tags: tagsToInput(faq.tags)
        });
    };

    const handleUpdateFAQ = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        if (!editingFAQ) return;
        setFeedback(null);
        setSavingFAQ(true);
        try {
            await updateFAQ(id, {
                question: editingFAQ.question,
                answer: editingFAQ.answer,
                tags: tagsFromInput(editingFAQ.tags)
            });
            setEditingFAQ(null);
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to update FAQ');
        } finally {
            setSavingFAQ(false);
        }
    };

    const deletePendingKnowledge = async () => {
        const item = pendingDeletion;
        if (!item) return;
        setFeedback(null);
        try {
            if (item.kind === 'sop') {
                await deleteSOP(item.id);
                if (editingSOP?.id === item.id) setEditingSOP(null);
            } else {
                await deleteFAQ(item.id);
                if (editingFAQ?.id === item.id) setEditingFAQ(null);
            }
            onUpdate();
        } catch (error) {
            const message = error instanceof Error ? error.message : `Failed to delete ${item.kind === 'sop' ? 'SOP' : 'FAQ'}`;
            setFeedback(message);
            throw new Error(message);
        }
    };

    return (
        <>
        <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Knowledge scope</h2>
                    <p className="mt-1 text-sm text-gray-600">Shared knowledge applies across the winery. Area knowledge is used alongside it when work belongs to that area.</p>
                </div>
                <label className="text-sm font-medium text-gray-700">
                    Scope
                    <select
                        value={selectedAreaId}
                        onChange={event => {
                            setSelectedAreaId(Number(event.target.value));
                            setEditingFAQ(null);
                            setEditingSOP(null);
                        }}
                        className="mt-1 block min-w-56 rounded-md border border-gray-300 bg-white p-2"
                    >
                        <option value={0}>Winery-wide shared</option>
                        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                </label>
            </div>

            {feedback && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}

            {!canEdit && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This knowledge is readable. Only {selectedArea ? `${selectedArea.name} managers` : 'winery managers'} can change it.
                </div>
            )}

            {/* SOP Manager */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Standard Operating Procedures</h3>

                {sops.map(sop => (
                    <div key={sop.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                        {canEdit && <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                            <button onClick={() => setEditingSOP(sop)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                            <button type="button" onClick={() => setPendingDeletion({ kind: 'sop', id: sop.id, title: sop.title })} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </div>}
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
                    <fieldset disabled={!canEdit} className="flex flex-col gap-4 disabled:opacity-70">
                    <h4 className="text-sm font-medium text-gray-700">Add New Procedure</h4>
                    <input type="text" placeholder="Procedure title" required value={newSOP.title} onChange={e => setNewSOP({ ...newSOP, title: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <textarea rows={3} placeholder="Procedure body" required value={newSOP.body} onChange={e => setNewSOP({ ...newSOP, body: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <div className="flex justify-end">
                        <button type="submit" disabled={saving} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                            {saving ? 'Adding...' : 'Add Policy'}
                        </button>
                    </div>
                    </fieldset>
                </form>
            </div>

            {/* FAQ Manager */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Frequently Asked Questions (AI Knowledge Base)</h3>

                {faqs.map(faq => (
                    <div key={faq.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                        {canEdit && <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                            <button onClick={() => handleEditFAQ(faq)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                            <button type="button" onClick={() => setPendingDeletion({ kind: 'faq', id: faq.id, title: faq.question })} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </div>}
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
                    <fieldset disabled={!canEdit} className="flex flex-col gap-4 disabled:opacity-70">
                    <h4 className="text-sm font-medium text-gray-700">Add New Q&A Pair</h4>
                    <input type="text" placeholder="Question" required value={newFAQ.question} onChange={e => setNewFAQ({ ...newFAQ, question: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <textarea rows={2} placeholder="Answer" required value={newFAQ.answer} onChange={e => setNewFAQ({ ...newFAQ, answer: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    <div className="flex justify-between items-center">
                        <input type="text" placeholder="Tags (e.g. shipping, dogs)" value={newFAQ.tags} onChange={e => setNewFAQ({ ...newFAQ, tags: e.target.value })} className="block w-2/3 rounded-md border-gray-300 shadow-sm border p-2 text-sm" />
                        <button type="submit" className="ml-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">Add FAQ</button>
                    </div>
                    </fieldset>
                </form>
            </div>
        </div>
        <ConfirmDialog
            open={Boolean(pendingDeletion)}
            onClose={() => setPendingDeletion(null)}
            onConfirm={deletePendingKnowledge}
            title={pendingDeletion?.kind === 'sop' ? 'Delete SOP?' : 'Delete FAQ?'}
            description={pendingDeletion ? `"${pendingDeletion.title}" will be permanently removed from this knowledge scope.` : ''}
            confirmLabel={pendingDeletion?.kind === 'sop' ? 'Delete SOP' : 'Delete FAQ'}
            destructive
        />
        </>
    );
}
